#!/usr/bin/env bun
/**
 * YouTube upload script using OAuth2 + YouTube Data API v3
 * Usage: bun run scripts/youtube-upload.ts <video.mp4> --title "Title" [--description "..."] [--tags "a,b,c"] [--public]
 */
import { readFile } from 'fs/promises';
import { basename } from 'path';

const CREDS_PATH = new URL('../.youtube-credentials.json', import.meta.url).pathname;

interface Creds {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

async function getAccessToken(creds: Creds): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const data = await resp.json() as any;
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function uploadVideo(opts: {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  isPublic: boolean;
  isShort?: boolean;
}) {
  const creds: Creds = JSON.parse(await readFile(CREDS_PATH, 'utf-8'));
  const token = await getAccessToken(creds);
  
  const videoData = await readFile(opts.filePath);
  const privacy = opts.isPublic ? 'public' : 'private';
  
  // Add #Shorts to title if it's a short and not already there
  let title = opts.title;
  if (opts.isShort && !title.includes('#Shorts')) {
    title = title + ' #Shorts';
  }

  const metadata = {
    snippet: {
      title,
      description: opts.description,
      tags: opts.tags,
      categoryId: '28' // Science & Technology
    },
    status: {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: false
    }
  };

  // Step 1: Initiate resumable upload
  console.log(`📤 Uploading: ${opts.filePath} (${(videoData.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   Title: ${title}`);
  console.log(`   Privacy: ${privacy}`);

  const initResp = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(videoData.length),
        'X-Upload-Content-Type': 'video/mp4'
      },
      body: JSON.stringify(metadata)
    }
  );

  if (!initResp.ok) {
    const err = await initResp.text();
    throw new Error(`Upload init failed (${initResp.status}): ${err}`);
  }

  const uploadUrl = initResp.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL in response');

  // Step 2: Upload the video data
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoData.length)
    },
    body: videoData
  });

  if (!uploadResp.ok) {
    const err = await uploadResp.text();
    throw new Error(`Upload failed (${uploadResp.status}): ${err}`);
  }

  const result = await uploadResp.json() as any;
  console.log(`\n✅ Uploaded! Video ID: ${result.id}`);
  console.log(`   URL: https://youtube.com/watch?v=${result.id}`);
  if (opts.isShort) {
    console.log(`   Shorts: https://youtube.com/shorts/${result.id}`);
  }
  return result;
}

async function updateChannelBranding(opts: {
  profilePicturePath?: string;
  bannerPath?: string;
}) {
  const creds: Creds = JSON.parse(await readFile(CREDS_PATH, 'utf-8'));
  const token = await getAccessToken(creds);

  if (opts.bannerPath) {
    console.log('🖼️  Uploading channel banner...');
    const bannerData = await readFile(opts.bannerPath);
    const resp = await fetch('https://www.googleapis.com/upload/youtube/v3/channelBanners/insert?uploadType=media', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'image/png',
        'Content-Length': String(bannerData.length)
      },
      body: bannerData
    });
    if (!resp.ok) throw new Error(`Banner upload failed: ${await resp.text()}`);
    const bannerResult = await resp.json() as any;
    
    // Set the banner on the channel
    const channelResp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&mine=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const channelData = await channelResp.json() as any;
    const channelId = channelData.items[0].id;
    
    await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: channelId,
        brandingSettings: {
          ...channelData.items[0].brandingSettings,
          image: { bannerExternalUrl: bannerResult.url }
        }
      })
    });
    console.log('   ✅ Banner set');
  }
}

// --- CLI ---
const args = process.argv.slice(2);
const videoPath = args.find(a => a.endsWith('.mp4'));

if (args.includes('--brand')) {
  const bannerIdx = args.indexOf('--banner');
  const banner = bannerIdx >= 0 ? args[bannerIdx + 1] : undefined;
  await updateChannelBranding({ bannerPath: banner });
} else if (videoPath) {
  const titleIdx = args.indexOf('--title');
  const descIdx = args.indexOf('--description');
  const tagsIdx = args.indexOf('--tags');
  
  await uploadVideo({
    filePath: videoPath,
    title: titleIdx >= 0 ? args[titleIdx + 1] : basename(videoPath, '.mp4'),
    description: descIdx >= 0 ? args[descIdx + 1] : '',
    tags: tagsIdx >= 0 ? args[tagsIdx + 1].split(',') : [],
    isPublic: args.includes('--public'),
    isShort: args.includes('--short')
  });
} else {
  console.log('Usage:');
  console.log('  Upload:  bun run scripts/youtube-upload.ts video.mp4 --title "..." --public [--short] [--description "..."] [--tags "a,b"]');
  console.log('  Brand:   bun run scripts/youtube-upload.ts --brand --banner banner.png');
}
