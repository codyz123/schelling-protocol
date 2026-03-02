#!/usr/bin/env bun
/**
 * Video generation pipeline for Schelling Protocol
 * Usage: bun run scripts/video-gen.ts scenes/<scene>.json [--output content/videos/]
 */
import { mkdir, writeFile, readFile, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { $ } from 'bun';
import { titleCard } from './video-templates/title-card';
import { terminal } from './video-templates/terminal';
import { matchResults } from './video-templates/match-results';

const ELEVENLABS_KEY = 'sk_21db619bb40e554f4cf86d8f0851c932c657add8ad2c2655';
const FPS = 24; // 24fps is fine for this content, saves render time

interface Scene {
  id: string;
  duration_sec: number;
  narration: string;
  visual: {
    type: 'title_card' | 'terminal' | 'match_results' | 'stats';
    headline?: string;
    subhead?: string;
    logo?: boolean;
    command?: string;
    output?: string;
    candidates?: Array<{ label: string; score: number; traits: string[]; price: string }>;
  };
}

interface SceneFile {
  meta: { title: string; duration_target_sec: number; aspect: string; resolution: [number, number] };
  voice: { voice_id: string; model: string };
  scenes: Scene[];
}

// --- Frame generation ---
function generateFrameHtml(scene: Scene, frameIdx: number, totalFrames: number, w: number, h: number): string {
  const progress = frameIdx / totalFrames;
  const v = scene.visual;

  switch (v.type) {
    case 'title_card':
      return titleCard({ headline: v.headline || '', subhead: v.subhead, width: w, height: h, logo: v.logo });
    
    case 'terminal': {
      const cmd = v.command || '';
      const typingEnd = 0.6; // spend 60% of time typing
      const typedChars = progress < typingEnd
        ? Math.floor((progress / typingEnd) * cmd.length)
        : cmd.length;
      const showOutput = progress > typingEnd + 0.05;
      const cursorVisible = Math.floor(frameIdx / (FPS / 2)) % 2 === 0; // blink
      return terminal({ command: cmd, output: v.output || '', width: w, height: h, typedChars, showOutput, cursorVisible });
    }

    case 'match_results':
      return matchResults({
        candidates: v.candidates || [],
        width: w, height: h,
        fillPercent: Math.min(1, progress * 1.5) // fill in first 2/3 of scene
      });

    default:
      return titleCard({ headline: scene.id, width: w, height: h });
  }
}

// --- ElevenLabs TTS ---
async function generateAudio(text: string, voiceId: string, model: string, outPath: string): Promise<number> {
  console.log(`  🎙️ Generating audio: "${text.slice(0, 50)}..."`);
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
  });
  if (!resp.ok) throw new Error(`ElevenLabs error: ${resp.status} ${await resp.text()}`);
  const buf = await resp.arrayBuffer();
  await writeFile(outPath, Buffer.from(buf));
  
  // Get duration via ffprobe
  const result = await $`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${outPath}`.text();
  return parseFloat(result.trim());
}

// --- SRT caption generation ---
function generateSrt(scenes: Array<{ narration: string; startTime: number; duration: number }>): string {
  let srt = '';
  let idx = 1;
  for (const s of scenes) {
    if (!s.narration) continue;
    // Split narration into chunks of ~8 words
    const words = s.narration.split(' ');
    const chunkSize = 8;
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    const chunkDur = s.duration / chunks.length;
    for (let i = 0; i < chunks.length; i++) {
      const start = s.startTime + i * chunkDur;
      const end = start + chunkDur;
      srt += `${idx}\n${formatTime(start)} --> ${formatTime(end)}\n${chunks[i]}\n\n`;
      idx++;
    }
  }
  return srt;
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

// --- Main pipeline ---
async function main() {
  const sceneFile = process.argv[2];
  if (!sceneFile) { console.error('Usage: bun run scripts/video-gen.ts <scene.json> [--output dir]'); process.exit(1); }
  
  const outputDir = process.argv.includes('--output') 
    ? process.argv[process.argv.indexOf('--output') + 1]
    : 'content/videos';
  
  const scene: SceneFile = JSON.parse(await readFile(sceneFile, 'utf-8'));
  const [W, H] = scene.meta.resolution;
  const name = basename(sceneFile, '.json');
  
  // Temp dirs
  const tmpDir = join('/tmp', `schelling-video-${name}-${Date.now()}`);
  const framesDir = join(tmpDir, 'frames');
  const audioDir = join(tmpDir, 'audio');
  await mkdir(framesDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  console.log(`🎬 Generating: ${scene.meta.title}`);
  console.log(`   Resolution: ${W}x${H} | FPS: ${FPS}`);
  console.log(`   Scenes: ${scene.scenes.length}`);

  // Step 1: Generate audio for all scenes
  console.log('\n📢 Step 1: Generating narration audio...');
  const sceneTimings: Array<{ narration: string; startTime: number; duration: number }> = [];
  let currentTime = 0;

  for (let i = 0; i < scene.scenes.length; i++) {
    const s = scene.scenes[i];
    let audioDuration = s.duration_sec;
    
    if (s.narration) {
      const audioPath = join(audioDir, `scene-${i}.mp3`);
      audioDuration = await generateAudio(s.narration, scene.voice.voice_id, scene.voice.model, audioPath);
      // Use the longer of specified duration or audio duration (+ 0.5s padding)
      audioDuration = Math.max(s.duration_sec, audioDuration + 0.5);
    }
    
    sceneTimings.push({ narration: s.narration, startTime: currentTime, duration: audioDuration });
    currentTime += audioDuration;
  }

  console.log(`   Total duration: ${currentTime.toFixed(1)}s`);

  // Step 2: Concatenate audio
  console.log('\n🔊 Step 2: Concatenating audio...');
  const audioListFile = join(tmpDir, 'audio-list.txt');
  let audioListContent = '';
  for (let i = 0; i < scene.scenes.length; i++) {
    const audioPath = join(audioDir, `scene-${i}.mp3`);
    if (existsSync(audioPath)) {
      // Add silence padding if needed
      const timing = sceneTimings[i];
      const silencePath = join(audioDir, `silence-${i}.mp3`);
      const audioResult = await $`ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${audioPath}`.text();
      const actualDur = parseFloat(audioResult.trim());
      const silenceDur = timing.duration - actualDur;
      
      audioListContent += `file '${audioPath}'\n`;
      if (silenceDur > 0.1) {
        await $`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${silenceDur} -q:a 9 ${silencePath}`.quiet();
        audioListContent += `file '${silencePath}'\n`;
      }
    } else {
      // Generate silence for scenes without narration
      const silencePath = join(audioDir, `silence-${i}.mp3`);
      await $`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${sceneTimings[i].duration} -q:a 9 ${silencePath}`.quiet();
      audioListContent += `file '${silencePath}'\n`;
    }
  }
  await writeFile(audioListFile, audioListContent);
  const fullAudioPath = join(tmpDir, 'narration.mp3');
  await $`ffmpeg -y -f concat -safe 0 -i ${audioListFile} -c:a libmp3lame -q:a 2 ${fullAudioPath}`.quiet();

  // Step 3: Generate frames
  console.log('\n🎨 Step 3: Rendering frames...');
  
  // Check if playwright is available
  try {
    await $`npx playwright --version`.quiet();
  } catch {
    console.log('   Installing Playwright chromium...');
    await $`npx playwright install chromium`.quiet();
  }

  let globalFrame = 0;
  for (let i = 0; i < scene.scenes.length; i++) {
    const s = scene.scenes[i];
    const timing = sceneTimings[i];
    const totalFrames = Math.ceil(timing.duration * FPS);
    console.log(`   Scene ${i + 1}/${scene.scenes.length}: "${s.id}" (${totalFrames} frames)`);

    for (let f = 0; f < totalFrames; f++) {
      const html = generateFrameHtml(s, f, totalFrames, W, H);
      const htmlPath = join(framesDir, `frame-${String(globalFrame).padStart(6, '0')}.html`);
      await writeFile(htmlPath, html);
      globalFrame++;
    }
  }
  console.log(`   Total frames: ${globalFrame}`);

  // Render HTML frames to PNG using Playwright
  console.log('\n📸 Step 4: Rendering HTML → PNG via Playwright...');
  const renderScript = join('/Users/codyz/Documents/a2a-assistant-matchmaker', '.render-tmp.mjs');
  await writeFile(renderScript, `
import { chromium } from 'playwright';
import { readdir } from 'fs/promises';
import { join } from 'path';

const framesDir = '${framesDir}';
const files = (await readdir(framesDir)).filter(f => f.endsWith('.html')).sort();
console.log('Rendering ' + files.length + ' frames...');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: ${W}, height: ${H} } });

for (let i = 0; i < files.length; i++) {
  const htmlPath = join(framesDir, files[i]);
  const pngPath = htmlPath.replace('.html', '.png');
  await page.goto('file://' + htmlPath);
  await page.screenshot({ path: pngPath });
  if (i % 100 === 0) process.stdout.write('  ' + i + '/' + files.length + '\\r');
}
console.log('  Done: ' + files.length + ' frames rendered');
await browser.close();
`);

  await $`node ${renderScript}`.cwd('/Users/codyz/Documents/a2a-assistant-matchmaker');

  // Step 5: Generate SRT captions
  console.log('\n📝 Step 5: Generating captions...');
  const srtPath = join(tmpDir, 'captions.srt');
  await writeFile(srtPath, generateSrt(sceneTimings));

  // Step 6: Assemble video
  console.log('\n🎬 Step 6: Assembling final video...');
  const rawVideoPath = join(tmpDir, 'raw.mp4');
  const outputPath = join(outputDir, `${name}.mp4`);

  // Frames → video
  await $`ffmpeg -y -framerate ${FPS} -i ${join(framesDir, 'frame-%06d.png')} -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 ${rawVideoPath}`.quiet();

  // Add audio + captions
  // Use Bun.spawn to avoid shell metachar issues with ffmpeg subtitles filter
  const forceStyle = 'FontName=Arial,FontSize=20,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,MarginV=60';
  const vfArg = `subtitles=${srtPath}:force_style='${forceStyle}'`;
  const ffResult = Bun.spawnSync(['ffmpeg', '-y', '-i', rawVideoPath, '-i', fullAudioPath, '-vf', vfArg, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-shortest', outputPath]);
  if (ffResult.exitCode !== 0) {
    throw new Error(`ffmpeg failed (exit ${ffResult.exitCode}): ${ffResult.stderr.toString()}`);
  }

  const stat = Bun.file(outputPath);
  console.log(`\n✅ Video saved: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

  // Cleanup
  await rm(tmpDir, { recursive: true, force: true });
  console.log('🧹 Temp files cleaned up');
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });
