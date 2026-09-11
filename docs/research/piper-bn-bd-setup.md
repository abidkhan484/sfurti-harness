# Piper Bangla (`bn_BD`) local setup

This runbook prepares a local, offline narration tool for the Research → Content
Engine. It does **not** enable research mode, schedule content, upload media, or
make a Facebook request. A passing command below is a local-tool check, not a
live-readiness claim.

Ticket 21 will integrate this installation through a typed TTS adapter. Until
that ticket lands, this document is an operator setup record and the existing
legacy licensed-clip workflow remains unchanged.

## What to install

Install these on the machine that will render original explainers:

- Python 3 with `venv` support and a supported `piper-tts` release.
- Piper's `bn_BD-google-medium` voice files: the ONNX model, adjacent
  `.onnx.json` configuration, and `MODEL_CARD`, all from one immutable upstream
  revision.
- FFmpeg and FFprobe, available on `PATH` for the future compositor and media
  inspector.
- A Bangla-capable font for scene rendering. Font selection/provenance is a
  separate rendering setup check.

Piper itself has no Page credential or API secret. Keep Page credentials only
in the private `.env` file used by the future Facebook integration; never place
them in a model path, command argument, tracked configuration, or this guide.

## Create an evaluation environment

From the repository root, create an isolated Python environment. Do not run a
model download as part of this step.

```sh
python3 -m venv .venv/piper
. .venv/piper/bin/activate
python -m pip install --upgrade pip
python -m pip index versions piper-tts
```

Choose a release only after checking the release notes and local CLI behavior.
Record the exact selected package version in the setup record below, then
install that exact version rather than a floating `latest` release:

```sh
python -m pip install "piper-tts==<reviewed-version>"
python -m piper --help
```

The exact release is intentionally not pinned in this repository yet. Contract
C12 requires the implementation ticket to pin a release only after a local
compatibility test. An unpinned package installation may be used to inspect the
CLI, but is not an approved production dependency.

## Select and pin the expected voice

The expected candidate is `bn_BD-google-medium`, not a generic `bn` or
`bn_IN` substitution. At the time this runbook was written, the upstream voice
registry describes it as a medium-quality 22,050 Hz voice with 16 speaker IDs
(0 through 15). Its model card also lists `bn_IN`; that does not remove the
required Bangladesh-native listener review.

Use the Piper voices registry to identify the exact upstream revision first.
Do **not** make a production pin to the moving `main` branch and do not rely on
an automatic downloader unless it can record the same immutable revision and
all downloaded file hashes.

1. Open the upstream `bn/bn_BD/google/medium` directory and its `MODEL_CARD`.
2. Choose an immutable repository revision/commit after reviewing the card,
   voice/data terms, and current availability.
3. Download these three files from that _same_ revision into a private local
   directory outside tracked source, for example `data/local/piper/bn_BD-google-medium/`:

   - `bn_BD-google-medium.onnx`
   - `bn_BD-google-medium.onnx.json`
   - `MODEL_CARD`

4. Calculate SHA-256 hashes locally and retain the source URL and immutable
   revision. Do not copy a hash from a mutable listing into configuration
   without independently verifying the downloaded bytes.

```sh
sha256sum \
  data/local/piper/bn_BD-google-medium/bn_BD-google-medium.onnx \
  data/local/piper/bn_BD-google-medium/bn_BD-google-medium.onnx.json \
  data/local/piper/bn_BD-google-medium/MODEL_CARD
```

The upstream registry currently exposes MD5 digests as download metadata, but
Sfurti's configuration and cache identity require SHA-256. Generate and retain
the SHA-256 values above. Ticket 21 must reject a changed model/config hash and
invalidate the corresponding narration cache.

Suggested local setup record (keep the completed record private if it includes
local account paths):

```text
piper-tts version: <exact reviewed version>
piper executable: <absolute executable path>
voice key: bn_BD-google-medium
voice registry revision: <immutable commit or revision>
model path: <absolute .onnx path>
model sha256: <64 lowercase hex characters>
config path: <absolute .onnx.json path>
config sha256: <64 lowercase hex characters>
model card path: <absolute MODEL_CARD path>
model card sha256: <64 lowercase hex characters>
speaker IDs auditioned: <for example 0, 3, 8, 15>
selected speaker ID: <0-15>
listener-review date and reviewers: <record initials/roles, not sensitive data>
license/attribution decision: <approved / not approved, with rationale>
```

The upstream model card identifies its dataset terms, including an
Attribution-ShareAlike 4.0 dataset and CMU terms. Review the complete card and
obtain any required legal/attribution approval before distribution. Piper
runtime licensing and voice/data licensing are separate checks. No model is
approved for public output merely because it synthesizes a WAV file.

Upstream references: [voice directory](https://huggingface.co/rhasspy/piper-voices/tree/main/bn/bn_BD/google/medium),
[model card](https://huggingface.co/rhasspy/piper-voices/blob/main/bn/bn_BD/google/medium/MODEL_CARD),
and [voice registry entry](https://huggingface.co/rhasspy/piper-voices/blob/5b44ec7bab7c5822cfec48fbd5aa99db71a823d6/voices.json).

## Make and assess a Bangla sample

Use argument values and stdin, never a shell-composed command or model name
from generated/source text. The test sentence is fixed local fixture text;
real scripts remain untrusted until the content pipeline validates them.

```sh
mkdir -p data/local/piper/samples
printf '%s\n' 'আজকের বিষয়টি ধীরে শুনুন।' | \
  .venv/piper/bin/piper \
    --model "$PWD/data/local/piper/bn_BD-google-medium/bn_BD-google-medium.onnx" \
    --config "$PWD/data/local/piper/bn_BD-google-medium/bn_BD-google-medium.onnx.json" \
    --speaker 0 \
    --output_file "$PWD/data/local/piper/samples/bn-bd-speaker-0.wav"
```

Repeat for a deliberately bounded audition set (at minimum speakers 0, 3, 8,
and 15 if available), with the same short samples. Ask Bangladeshi Bangla
listeners to assess intelligibility, naturalness, pronunciation of Bangla
numbers/abbreviations, and suitability for parent-facing delivery. Record
material pronunciation problems and do not silently switch locale or provider.
If the candidate fails review, defer the live voice decision; a different voice
needs a new model-card, rights, hash, and listener-review record.

## Validate WAV and FFmpeg locally

First establish that the media tools are installed:

```sh
ffmpeg -version
ffprobe -version
```

Then inspect the generated sample. It must be nonempty, parse as WAV, have a
positive duration, and not be all silence. These checks are deterministic but
do not establish Bangla intelligibility.

```sh
WAV_PATH="$PWD/data/local/piper/samples/bn-bd-speaker-0.wav"
test -s "$WAV_PATH"
ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate,channels,duration \
  -of default=noprint_wrappers=1 "$WAV_PATH"
ffmpeg -hide_banner -i "$WAV_PATH" -af volumedetect -f null -
```

Reject output when FFprobe finds no audio stream, duration is zero/missing, or
FFmpeg reports `mean_volume: -inf`. Ticket 21 additionally probes duration,
sample rate, truncation and silence before an artifact can pass. For a
deterministic fixture-level check without downloading a voice, its test must
run the adapter against a stub executable that reads Unicode stdin, writes a
known audible WAV fixture, and verifies safe argument-array handling. The
repository command for that future test is:

```sh
node --test test/piper-tts.test.ts
```

## Harness configuration

Ticket 03 defines the current non-secret `tts` and `renderer` configuration
objects; ticket 21 owns the Piper adapter. `tts.executable`, `tts.voiceId`,
`tts.modelPath`, `tts.configPath`, `renderer.executable`, and
`renderer.fontPath` are deliberately nullable until this setup is verified.
Ticket 21 must extend the auditable configuration with the pinned version,
model-card path, hashes, speaker ID, cache directory, and bounded media limits.
The eventual non-secret configuration must include:

- absolute Piper executable, model, config and model-card paths;
- pinned `piper-tts` version, voice registry revision, and SHA-256 hashes;
- selected `bn_BD-google-medium` key and numeric speaker ID;
- cache directory and an explicit media timeout/size limit; and
- FFmpeg/FFprobe executable paths or a verified `PATH` resolution.

Keep values private in `config/harness.json` or another ignored local config.
Do not put model provenance in `.env` merely because the file is private:
`.env` is reserved for secrets/references, while model paths, versions and
hashes must remain auditable redacted setup metadata. Store only Page/API
credentials there; never commit their values.

## Readiness boundary

Local readiness requires: a pinned voice triple, hashes matching local bytes,
FFmpeg/FFprobe availability, audible WAV checks, and a documented native
listener review. Live readiness additionally requires the future full 30–60
second original-MP4 sample, independent audio inspection/ASR, documented media
provenance, and explicit operator authorization for any Page post. Upload is
not publication, and no setup command here grants permission to publish.
