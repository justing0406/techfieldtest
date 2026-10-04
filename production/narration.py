"""Synthesize beat-sized narration locally and save an exact edit timeline."""
import argparse
import ctypes
import ctypes.util
import json
from pathlib import Path


def restrict_network():
    """Deny network syscalls for this local inference process only."""
    library = ctypes.util.find_library('seccomp')
    if not library:
        raise RuntimeError('Local inference requires libseccomp to block network access.')
    seccomp = ctypes.CDLL(library, use_errno=True)
    seccomp.seccomp_init.argtypes = [ctypes.c_uint32]
    seccomp.seccomp_init.restype = ctypes.c_void_p
    seccomp.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    seccomp.seccomp_syscall_resolve_name.restype = ctypes.c_int
    seccomp.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    seccomp.seccomp_load.argtypes = [ctypes.c_void_p]
    seccomp.seccomp_release.argtypes = [ctypes.c_void_p]
    context = seccomp.seccomp_init(0x7fff0000)
    if not context:
        raise RuntimeError('Could not create the offline inference restriction.')
    try:
        for syscall in ['socket', 'connect', 'sendto', 'sendmsg', 'sendmmsg']:
            number = seccomp.seccomp_syscall_resolve_name(syscall.encode())
            if number < 0 or seccomp.seccomp_rule_add(context, 0x00050001, number, 0) != 0:
                raise RuntimeError('Could not deny a network syscall.')
        if seccomp.seccomp_load(context) != 0:
            raise RuntimeError('Could not enforce offline inference.')
    finally:
        seccomp.seccomp_release(context)


restrict_network()
import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro

# Disable runtime usage reporting before creating a local inference session.
ort.disable_telemetry_events()


def synthesize(project: Path, work: Path):
    config = json.loads(project.read_text())
    audio_dir = work / 'audio'
    audio_dir.mkdir(parents=True, exist_ok=True)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(work / 'models/kokoro-v1.0.int8.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    voice = Kokoro.from_session(session, str(work / 'models/voices-v1.0.bin'))
    print('Voice:', config['voice'], flush=True)
    timeline, parts, elapsed = [], [], .12
    parts.append(np.zeros(round(elapsed * 24000), dtype=np.float32))
    for index, beat in enumerate(config['beats']):
        path = audio_dir / f'{index:02d}-{beat["id"]}.wav'
        if path.exists():
            audio, rate = sf.read(path, dtype='float32')
        else:
            audio, rate = voice.create(beat['text'], voice=config['voice'], speed=config['voiceSpeed'], lang='en-us', sentence_pause=.16, clause_pause=.08)
        assert rate == 24000
        sf.write(path, audio, rate)
        spoken = len(audio) / rate
        timeline.append({**beat, 'start': round(elapsed, 5), 'speechEnd': round(elapsed + spoken, 5), 'end': round(elapsed + spoken + beat['hold'], 5)})
        parts.extend([audio, np.zeros(round(beat['hold'] * rate), dtype=np.float32)])
        elapsed += spoken + beat['hold']
        print(beat['id'], round(spoken, 2), 's', flush=True)
    sf.write(audio_dir / 'narration.wav', np.concatenate(parts), 24000)
    result = {**config, 'duration': elapsed, 'timeline': timeline}
    (work / 'timeline.json').write_text(json.dumps(result, indent=2))
    print('Total duration:', round(elapsed, 2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', type=Path, default=Path(__file__).with_name('project.json'))
    parser.add_argument('--work', type=Path, required=True)
    args = parser.parse_args()
    synthesize(args.project, args.work)
