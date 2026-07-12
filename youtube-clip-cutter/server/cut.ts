// Downloads a chosen fragment of a YouTube video as an MP4, saved to ~/Downloads.
//
// Runs as an Airglow server function (fresh Bun subprocess per RPC call, 120s
// timeout). Shells out to yt-dlp (--download-sections fetches ONLY the chosen
// range, so short clips finish fast) + ffmpeg.
//
// PATH gotcha: the daemon pins PATH to /usr/bin:/bin:/usr/sbin:/sbin, so neither
// yt-dlp nor ffmpeg (typically in Homebrew) is on PATH. We resolve absolute
// paths ourselves AND pass --ffmpeg-location to yt-dlp so it can find ffmpeg.

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

type CutBody = { videoId?: string; start?: number; end?: number; title?: string };

const YT_DLP_CANDIDATES = [
  process.env.YT_DLP_PATH,
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
];
const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
];

function firstExisting(paths: (string | undefined)[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

// A safe, readable filename fragment from the video title.
function sanitizeTitle(title: string | undefined, fallback: string): string {
  const base = (title ?? '')
    .replace(/\s*-\s*YouTube\s*$/i, '')   // strip the " - YouTube" tab-title suffix
    .replace(/[\\/:*?"<>|]+/g, ' ')        // filesystem-unsafe chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return base || fallback;
}

// Seconds → compact label for the filename, e.g. 95 → "1m35s".
function stamp(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m${r}s` : `${r}s`;
}

export default async function cut(body: CutBody) {
  // ── Resolve tools ──
  const ytdlp = firstExisting(YT_DLP_CANDIDATES);
  if (!ytdlp) {
    return { ok: false, code: 'MISSING_YTDLP', error: 'yt-dlp is not installed. Install it once: brew install yt-dlp' };
  }
  const ffmpeg = firstExisting(FFMPEG_CANDIDATES);
  if (!ffmpeg) {
    return { ok: false, code: 'MISSING_FFMPEG', error: 'ffmpeg is not installed. Install it once: brew install ffmpeg' };
  }

  // ── Validate inputs ──
  const videoId = String(body?.videoId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return { ok: false, code: 'BAD_VIDEO', error: 'Invalid or missing video id.' };
  }
  const start = Number(body?.start);
  const end = Number(body?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return { ok: false, code: 'BAD_RANGE', error: 'Invalid time range (need 0 ≤ start < end).' };
  }

  // ── Output path (~/Downloads/<title>_<start>-<end>.mp4) ──
  const downloads = join(homedir(), 'Downloads');
  try { mkdirSync(downloads, { recursive: true }); } catch {}
  const baseName = `${sanitizeTitle(body.title, videoId)}_${stamp(start)}-${stamp(end)}`;
  // Let yt-dlp pick the extension via the template, then locate the merged file.
  const outTemplate = join(downloads, `${baseName}.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // ── Run yt-dlp (downloads only the selected section, merges to mp4) ──
  const args = [
    ytdlp,
    '--no-playlist',
    '--no-warnings',
    '--download-sections', `*${start}-${end}`,
    '--force-keyframes-at-cuts',
    '-f', 'bestvideo*+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', dirname(ffmpeg), // critical: PATH is restricted
    '-o', outTemplate,
    url,
  ];

  let proc;
  try {
    proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe', cwd: downloads });
  } catch (e: any) {
    return { ok: false, code: 'SPAWN_FAILED', error: `Could not run yt-dlp: ${e?.message ?? e}` };
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    // Surface the most useful tail of yt-dlp's error output.
    const errLine =
      (stderr || stdout)
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /error/i.test(l))
        .slice(-1)[0] ||
      (stderr || stdout).trim().split('\n').slice(-1)[0] ||
      `yt-dlp exited ${exitCode}`;
    return { ok: false, code: 'YTDLP_FAILED', error: errLine.slice(0, 400) };
  }

  // ── Find the produced file (template resolved its own extension) ──
  let file: string | null = null;
  try {
    const candidates = readdirSync(downloads).filter((f) => f.startsWith(`${baseName}.`));
    // Prefer the mp4 merge output.
    file = candidates.find((f) => f.endsWith('.mp4')) ?? candidates[0] ?? null;
  } catch {}
  if (!file) {
    return { ok: false, code: 'NO_OUTPUT', error: 'yt-dlp finished but no output file was found in Downloads.' };
  }

  return { ok: true, file, path: join(downloads, file) };
}
