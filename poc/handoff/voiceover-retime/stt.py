import json
from faster_whisper import WhisperModel
m = WhisperModel('small.en', device='cpu', compute_type='int8')
segs, info = m.transcribe('out/vo/vo16.wav', word_timestamps=True, beam_size=5, vad_filter=False)
words = []
for s in segs:
    print(f'{s.start:6.2f}-{s.end:6.2f} {s.text}')
    words += [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3), 'p': round(w.probability, 2)} for w in s.words]
json.dump(words, open('out/vo/words.json', 'w'), indent=0)
