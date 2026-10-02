#!/usr/bin/env python3
"""DJI voice A/B processing; requires ffmpeg + ffprobe. Never overwrites files.

Run: python3 ~/Downloads/process_voice.py --spectrograms
Tweak the gains below, then use a NEW output directory for another comparison:
  python3 ~/Downloads/process_voice.py --out-dir ~/Downloads/voice-test-2
Or supply another input: python3 process_voice.py /path/to/input.wav --out-dir ./new-test
Compressor makeup uses ffmpeg's linear gain units, exactly as requested.
"""
import argparse
import hashlib
import json
import re
import subprocess
import shutil
import tempfile
from pathlib import Path

# Edit g= values for EQ/air, i= for de-essing, or any other settings here.
# Each list is processed in this exact order, then loudness-normalized.
VERSIONS = {
    'voice_A_subtle': [
        'highpass=f=80',
        'equalizer=f=250:t=q:w=1.0:g=-2',
        'equalizer=f=3500:t=q:w=1.0:g=2',
        'highshelf=f=9000:g=2',
        'deesser=i=0.3',
        'acompressor=threshold=-20dB:ratio=2:attack=10:release=100:makeup=1',
    ],
    'voice_B_medium': [
        'highpass=f=90',
        'equalizer=f=200:t=q:w=0.8:g=-3',
        'equalizer=f=350:t=q:w=1.2:g=-2',
        'equalizer=f=3500:t=q:w=1.0:g=3.5',
        'highshelf=f=9000:g=3.5',
        'afftdn=nf=-30',
        'deesser=i=0.4',
        'acompressor=threshold=-18dB:ratio=3:attack=5:release=80:makeup=2',
    ],
    'voice_C_aggressive': [
        'highpass=f=110',
        'equalizer=f=200:t=q:w=0.8:g=-5',
        'equalizer=f=400:t=q:w=1.2:g=-3',
        'equalizer=f=4000:t=q:w=1.0:g=5',
        'highshelf=f=10000:g=5',
        'afftdn=nf=-25',
        'deesser=i=0.5',
        'acompressor=threshold=-16dB:ratio=4:attack=5:release=60:makeup=3',
    ],
}
TARGET = 'loudnorm=I=-16:TP=-1.5:LRA=11'
DEFAULT_INPUT = Path(__file__).resolve().with_name('Signals-launch-video-09-29-09-56.m4a')


def run(command):
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'Command failed: {command}\n{result.stderr[-8000:]}')
    return result


def ffmpeg(source, args):
    return run(['ffmpeg', '-hide_banner', '-nostdin', '-n', '-i', str(source), *args])


def measure(source, prefix=''):
    result = ffmpeg(source, ['-map', '0:a:0', '-af', prefix + TARGET + ':print_format=json', '-f', 'null', '-'])
    matches = re.findall(r'\{[^{}]*"input_i"[^{}]*\}', result.stderr, re.S)
    if not matches:
        raise RuntimeError('Missing loudnorm measurement')
    return json.loads(matches[-1])


def probe(source):
    return json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_name,sample_rate,channels,bits_per_raw_sample:format=duration',
        '-of', 'json', str(source)]).stdout)


def spectrum(source, destination):
    ffmpeg(source, ['-filter_complex', '[0:a:0]showspectrumpic=s=1200x600:legend=1:scale=log:fscale=log[v]',
        '-map', '[v]', '-frames:v', '1', '-update', '1', str(destination)])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('input', nargs='?', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--out-dir', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--spectrograms', action='store_true')
    args = parser.parse_args()
    source, out = args.input.expanduser().resolve(), args.out_dir.expanduser().resolve()
    if not source.is_file():
        parser.error(f'Input does not exist: {source}')
    names = [name + '.wav' for name in VERSIONS] + ['voice_processing_report.json']
    if args.spectrograms:
        names += [name + '_spectrum.png' for name in ['voice_original', *VERSIONS]]
    for name in names:
        if (out / name).exists():
            parser.error(f'Refusing to overwrite {out / name}; use a new --out-dir')
    out.mkdir(parents=True, exist_ok=True)
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    stream = probe(source)['streams'][0]
    filters = run(['ffmpeg', '-hide_banner', '-filters']).stdout
    deesser = bool(re.search(r'\sdeesser\s', filters))
    report = {'input': str(source), 'input_sha256': original_hash, 'target': TARGET,
        'deesser_available': deesser, 'original_loudness': measure(source), 'versions': {}}
    for name, configured in VERSIONS.items():
        chain = [f if deesser or not f.startswith('deesser=') else 'equalizer=f=7000:t=q:w=2:g=-2' for f in configured]
        prefix = ','.join(chain) + ','
        print(f'{name}: measuring processed audio...', flush=True)
        measured = measure(source, prefix)
        # Small peak headroom covers overshoot when loudnorm's 192kHz output
        # is resampled to the recording's sample rate. Verify the final WAV.
        norm_base = TARGET.replace('TP=-1.5', 'TP=-1.55') + ''.join(f':{key}={measured[value]}' for key, value in [
            ('measured_I', 'input_i'), ('measured_TP', 'input_tp'), ('measured_LRA', 'input_lra'),
            ('measured_thresh', 'input_thresh')])
        offset = float(measured['target_offset'])
        destination = out / (name + '.wav')
        with tempfile.TemporaryDirectory(prefix='.voice-render-', dir=out) as temp:
            for attempt in range(5):
                normalization = norm_base + f':offset={offset:.4f}:linear=true'
                candidate = Path(temp) / f'attempt-{attempt}.wav'
                ffmpeg(source, ['-map', '0:a:0', '-af', prefix + normalization, '-ar', stream['sample_rate'],
                    '-c:a', 'pcm_s24le', str(candidate)])
                verified, info = measure(candidate), probe(candidate)
                if abs(float(verified['input_i']) + 16) <= .1 and float(verified['input_tp']) <= -1.5:
                    break
                # Re-render FROM THE ORIGINAL; never stack processing passes.
                offset += -16 - float(verified['input_i'])
            else:
                raise RuntimeError(f'{name}: loudness/peak verification failed: {verified}')
            audio = info['streams'][0]
            if audio['codec_name'] != 'pcm_s24le' or audio.get('bits_per_raw_sample') != '24':
                raise RuntimeError(f'{name}: not 24-bit PCM')
            with candidate.open('rb') as source_file, destination.open('xb') as output_file:
                shutil.copyfileobj(source_file, output_file)
        report['versions'][name] = {'filters': chain, 'pass1': measured, 'normalization': normalization,
            'verified_loudness': verified, 'format': info, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
        if args.spectrograms:
            spectrum(destination, out / (name + '_spectrum.png'))
        print(f"{name}: {verified['input_i']} LUFS, {verified['input_tp']} dBTP", flush=True)
    if args.spectrograms:
        spectrum(source, out / 'voice_original_spectrum.png')
    if hashlib.sha256(source.read_bytes()).hexdigest() != original_hash:
        raise RuntimeError('Original input changed during processing')
    with (out / 'voice_processing_report.json').open('x') as handle:
        json.dump(report, handle, indent=2)
        handle.write('\n')
    print(f'Done. Original unchanged. Files saved to {out}', flush=True)


if __name__ == '__main__':
    main()
