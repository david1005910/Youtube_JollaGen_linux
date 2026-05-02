#!/usr/bin/env python3
"""
video_clipper.py — 최적화된 영상 클립 추출기

clip_video.py (youtube-clipper-skill) 구조 기반,
ffmpeg-guide.md 최적화 옵션 전면 적용:
  - 스트림 복사 (-c copy): 빠름, 무손실 [기본]
  - H.264 재인코딩: CRF 품질 조절, 멀티스레드
  - H.265 재인코딩: 더 높은 압축률
  - VAAPI 하드웨어 가속 (Linux Intel/AMD iGPU)
  - CUDA 하드웨어 가속 (NVIDIA GPU)
  - libass 자막 소각 (SRT → 하드코딩 자막)
  - 배치 처리: 여러 구간 한 번에 추출

사용법:
  # 단일 클립 (스트림 복사, 무손실)
  python video_clipper.py input.mp4 00:01:30 00:03:15 output.mp4

  # H.264 재인코딩 (CRF 18 고품질)
  python video_clipper.py input.mp4 00:01:30 00:03:15 output.mp4 --quality h264 --crf 18

  # 자막 소각 포함
  python video_clipper.py input.mp4 00:01:30 00:03:15 output.mp4 --subtitle subs.srt

  # 배치 처리 (JSON 파일)
  python video_clipper.py --batch clips.json

  # 하드웨어 가속 자동 선택
  python video_clipper.py input.mp4 0 120 output.mp4 --quality auto
"""

import os
import sys
import json
import shutil
import tempfile
import argparse
import subprocess
from enum import Enum
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Union


# ── 열거형 ─────────────────────────────────────────────────────────────────

class QualityMode(Enum):
    COPY   = "copy"    # 스트림 복사 (무손실, 가장 빠름)
    H264   = "h264"    # libx264 재인코딩 (범용)
    H265   = "h265"    # libx265 재인코딩 (고압축)
    VAAPI  = "vaapi"   # VAAPI 하드웨어 가속 (Linux Intel/AMD)
    CUDA   = "cuda"    # NVENC 하드웨어 가속 (NVIDIA)
    AUTO   = "auto"    # 환경에 맞는 모드 자동 선택


class SubtitleStyle(Enum):
    DEFAULT  = "default"   # 기본 스타일
    SHORTS   = "shorts"    # 세로 영상용 (크게, 가운데)
    CAPTION  = "caption"   # 화면 하단 자막


# ── 데이터 클래스 ──────────────────────────────────────────────────────────

@dataclass
class ClipSpec:
    """단일 클립 사양"""
    input_path:    str
    start_time:    Union[str, float]   # "00:01:30" 또는 초 단위
    end_time:      Union[str, float]
    output_path:   str
    subtitle_path: Optional[str] = None
    label:         Optional[str] = None


@dataclass
class ClipOptions:
    """인코딩·최적화 옵션"""
    quality:        QualityMode  = QualityMode.COPY
    crf:            int          = 23        # H.264/265 품질 (낮을수록 고품질, 파일 큼)
    threads:        int          = 0         # 0 = CPU 코어 수 자동
    preset:         str          = "fast"    # H.264 인코딩 속도 프리셋
    audio_bitrate:  str          = "128k"
    subtitle_style: SubtitleStyle = SubtitleStyle.DEFAULT
    vaapi_device:   str          = "/dev/dri/renderD128"
    overwrite:      bool         = True


# ── 유틸 함수 ──────────────────────────────────────────────────────────────

def time_to_seconds(time_str: str) -> float:
    """HH:MM:SS / MM:SS / SS.mmm → 초 변환 (clip_video.py 호환)"""
    time_str = str(time_str).strip()
    parts = time_str.split(':')
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def seconds_to_time(secs: float) -> str:
    """초 → HH:MM:SS 표시 변환"""
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h:02d}:{m:02d}:{s:05.2f}"


def format_size(n: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


# ── 하드웨어 가속 감지 ──────────────────────────────────────────────────────

def detect_hwaccel() -> QualityMode:
    """사용 가능한 하드웨어 가속 자동 감지 (ffmpeg-guide.md §하드웨어 가속)"""
    # NVIDIA CUDA 확인
    try:
        r = subprocess.run(
            ['ffmpeg', '-hwaccel', 'cuda', '-f', 'lavfi', '-i', 'nullsrc=s=64x64:d=0.1',
             '-c:v', 'h264_nvenc', '-f', 'null', '-'],
            capture_output=True, timeout=5
        )
        if r.returncode == 0:
            print("   🎮 하드웨어 가속: CUDA (NVIDIA NVENC)")
            return QualityMode.CUDA
    except Exception:
        pass

    # VAAPI 확인 (Linux Intel/AMD)
    vaapi_dev = "/dev/dri/renderD128"
    if Path(vaapi_dev).exists():
        try:
            r = subprocess.run(
                ['ffmpeg', '-hwaccel', 'vaapi', '-hwaccel_device', vaapi_dev,
                 '-f', 'lavfi', '-i', 'nullsrc=s=64x64:d=0.1',
                 '-c:v', 'h264_vaapi', '-f', 'null', '-'],
                capture_output=True, timeout=5
            )
            if r.returncode == 0:
                print("   🎮 하드웨어 가속: VAAPI (Intel/AMD iGPU)")
                return QualityMode.VAAPI
        except Exception:
            pass

    print("   💻 하드웨어 가속 없음 → H.264 소프트웨어 인코딩")
    return QualityMode.H264


# ── FFmpeg 명령어 빌더 ─────────────────────────────────────────────────────

def _subtitle_filter(subtitle_path: str, style: SubtitleStyle) -> str:
    """자막 소각용 -vf 필터 문자열 생성 (ffmpeg-guide.md §자막 스타일)"""
    # 공백 포함 경로 대응: 임시 디렉토리로 복사하여 처리
    styles = {
        SubtitleStyle.DEFAULT: "FontSize=24,MarginV=30,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Bold=1",
        SubtitleStyle.SHORTS:  "FontSize=32,MarginV=80,Alignment=2,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Bold=1",
        SubtitleStyle.CAPTION: "FontSize=20,MarginV=20,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Bold=0",
    }
    # 경로 이스케이프 (콜론, 백슬래시 처리)
    safe_path = subtitle_path.replace('\\', '/').replace(':', '\\:')
    return f"subtitles={safe_path}:force_style='{styles[style]}'"


def build_ffmpeg_cmd(
    spec: ClipSpec,
    opts: ClipOptions,
    ffmpeg: str,
    start_s: float,
    duration_s: float,
    tmp_sub: Optional[str] = None,
) -> list:
    """
    ffmpeg-guide.md 기반 최적화 명령어 조립

    위치 최적화: -ss를 -i 앞에 배치 (키프레임 단위 빠른 탐색)
    자막 소각 시: -ss를 -i 뒤로 이동 (정확한 프레임 탐색 필요)
    """
    threads = opts.threads if opts.threads > 0 else os.cpu_count() or 4
    has_sub = bool(tmp_sub or spec.subtitle_path)
    sub_file = tmp_sub or spec.subtitle_path

    # 자막 있으면 스트림 복사 불가 → H264 강제
    quality = opts.quality
    if has_sub and quality == QualityMode.COPY:
        quality = QualityMode.H264

    cmd = [ffmpeg]

    # 하드웨어 가속 초기화 (입력 전)
    if quality == QualityMode.VAAPI:
        cmd += ['-hwaccel', 'vaapi', '-hwaccel_device', opts.vaapi_device,
                '-hwaccel_output_format', 'vaapi']
    elif quality == QualityMode.CUDA:
        cmd += ['-hwaccel', 'cuda']

    # -ss 위치: 자막 없으면 -i 앞 (빠름), 자막 있으면 -i 뒤 (정확)
    if not has_sub:
        cmd += ['-ss', str(start_s)]

    cmd += ['-i', spec.input_path]

    if has_sub:
        cmd += ['-ss', str(start_s)]  # 자막 포함 시 정확한 탐색

    cmd += ['-t', str(duration_s)]

    # ── 코덱 설정 (ffmpeg-guide.md §3, §하드웨어 가속) ──
    if quality == QualityMode.COPY:
        # 스트림 복사: 가장 빠름, 무손실, 재인코딩 없음
        cmd += ['-c', 'copy', '-avoid_negative_ts', '1']

    elif quality == QualityMode.H264:
        # libx264: 범용, CRF 품질 제어, 멀티스레드
        vf_filters = []
        if has_sub:
            vf_filters.append(_subtitle_filter(sub_file, opts.subtitle_style))
        cmd += [
            '-c:v', 'libx264',
            '-crf', str(opts.crf),       # 화질 조절 (18=고품질, 23=균형, 28=저품질)
            '-preset', opts.preset,       # 인코딩 속도 (ultrafast~veryslow)
            '-threads', str(threads),     # 멀티스레드
            '-c:a', 'aac',
            '-b:a', opts.audio_bitrate,
        ]
        if vf_filters:
            cmd += ['-vf', ','.join(vf_filters)]

    elif quality == QualityMode.H265:
        # libx265: H.264보다 ~50% 작은 파일, 동일 품질
        # CRF 기준값이 다름: H.264 23 ≈ H.265 28
        cmd += [
            '-c:v', 'libx265',
            '-crf', str(opts.crf),
            '-preset', opts.preset,
            '-threads', str(threads),
            '-c:a', 'aac',
            '-b:a', opts.audio_bitrate,
        ]

    elif quality == QualityMode.VAAPI:
        # VAAPI 하드웨어 가속: Intel/AMD iGPU, CRF 미지원 → 비트레이트로 품질 조절
        # CRF를 QP로 근사 변환 (0~51, 낮을수록 고품질)
        qp = min(51, max(0, opts.crf))
        cmd += [
            '-vf', 'format=nv12,hwupload',
            '-c:v', 'h264_vaapi',
            '-qp', str(qp),
            '-c:a', 'aac',
            '-b:a', opts.audio_bitrate,
        ]

    elif quality == QualityMode.CUDA:
        # NVENC 하드웨어 가속: NVIDIA GPU
        cmd += [
            '-c:v', 'h264_nvenc',
            '-cq', str(opts.crf),        # Constant Quality (CRF 근사)
            '-preset', 'p4',             # NVENC 프리셋 (p1=빠름, p7=고품질)
            '-c:a', 'aac',
            '-b:a', opts.audio_bitrate,
        ]

    if opts.overwrite:
        cmd.append('-y')

    cmd.append(spec.output_path)
    return cmd


# ── 단일 클립 추출 ─────────────────────────────────────────────────────────

def clip_video(spec: ClipSpec, opts: ClipOptions) -> str:
    """
    단일 영상 구간 추출

    Args:
        spec: 클립 사양 (입력, 시작/끝 시간, 출력, 자막)
        opts: 인코딩 옵션 (품질 모드, CRF, 스레드 수 등)

    Returns:
        str: 출력 파일 경로
    """
    video_path  = Path(spec.input_path)
    output_path = Path(spec.output_path)

    if not video_path.exists():
        raise FileNotFoundError(f"입력 파일 없음: {video_path}")

    start_s  = time_to_seconds(spec.start_time) if isinstance(spec.start_time, str) else float(spec.start_time)
    end_s    = time_to_seconds(spec.end_time)   if isinstance(spec.end_time, str)   else float(spec.end_time)

    if start_s >= end_s:
        raise ValueError(f"시작({start_s}s) >= 종료({end_s}s)")

    duration_s = end_s - start_s

    # AUTO 모드: 최적 하드웨어 자동 선택
    if opts.quality == QualityMode.AUTO:
        opts = ClipOptions(**{**opts.__dict__, 'quality': detect_hwaccel()})

    ffmpeg = shutil.which('ffmpeg') or 'ffmpeg'
    output_path.parent.mkdir(parents=True, exist_ok=True)

    label = spec.label or output_path.name
    print(f"\n✂️  [{label}] 클립 추출")
    print(f"   입력:  {video_path.name}")
    print(f"   구간:  {seconds_to_time(start_s)} → {seconds_to_time(end_s)}  ({duration_s:.1f}초)")
    print(f"   출력:  {output_path.name}")
    print(f"   모드:  {opts.quality.value}", end="")
    if opts.quality not in (QualityMode.COPY, QualityMode.VAAPI, QualityMode.CUDA):
        print(f"  CRF={opts.crf}  threads={opts.threads or os.cpu_count()}", end="")
    if spec.subtitle_path:
        print(f"  + 자막({opts.subtitle_style.value})", end="")
    print()

    # 공백 경로 대응: 자막 파일을 임시 디렉토리로 복사
    tmp_dir = None
    tmp_sub = None
    if spec.subtitle_path and ' ' in spec.subtitle_path:
        tmp_dir = tempfile.mkdtemp()
        tmp_sub = str(Path(tmp_dir) / Path(spec.subtitle_path).name)
        shutil.copy2(spec.subtitle_path, tmp_sub)

    try:
        cmd = build_ffmpeg_cmd(spec, opts, ffmpeg, start_s, duration_s, tmp_sub)
        print(f"   FFmpeg: {' '.join(cmd[:8])} ...")

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"\n❌ FFmpeg 오류:\n{result.stderr[-800:]}")
            raise RuntimeError(f"FFmpeg 종료 코드: {result.returncode}")

        if not output_path.exists():
            raise RuntimeError("출력 파일이 생성되지 않음")

        print(f"   ✅ 완료  ({format_size(output_path.stat().st_size)})")
        return str(output_path)

    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


# ── 배치 처리 ──────────────────────────────────────────────────────────────

def batch_clip(specs: list[ClipSpec], opts: ClipOptions) -> list[dict]:
    """
    여러 구간 순차 추출

    Args:
        specs: ClipSpec 리스트
        opts: 공통 인코딩 옵션

    Returns:
        list[dict]: 각 클립 결과 {"label", "output", "ok", "error"}
    """
    total = len(specs)
    results = []
    print(f"\n📦 배치 처리: {total}개 클립")

    for i, spec in enumerate(specs, 1):
        print(f"\n[{i}/{total}]", end="")
        try:
            out = clip_video(spec, opts)
            results.append({"label": spec.label or spec.output_path, "output": out, "ok": True})
        except Exception as e:
            print(f"\n   ❌ 실패: {e}")
            results.append({"label": spec.label or spec.output_path, "output": None, "ok": False, "error": str(e)})

    ok = sum(1 for r in results if r["ok"])
    print(f"\n\n✨ 배치 완료: {ok}/{total} 성공")
    return results


# ── JSON 배치 파일 파서 ────────────────────────────────────────────────────

def load_batch_json(path: str) -> tuple[list[ClipSpec], ClipOptions]:
    """
    배치 JSON 형식:
    {
      "options": { "quality": "h264", "crf": 20, "threads": 4 },
      "clips": [
        { "input": "video.mp4", "start": "00:01:30", "end": "00:03:15",
          "output": "clip1.mp4", "subtitle": "subs.srt", "label": "인트로" }
      ]
    }
    """
    with open(path) as f:
        data = json.load(f)

    raw_opts = data.get("options", {})
    opts = ClipOptions(
        quality        = QualityMode(raw_opts.get("quality", "copy")),
        crf            = int(raw_opts.get("crf", 23)),
        threads        = int(raw_opts.get("threads", 0)),
        preset         = raw_opts.get("preset", "fast"),
        audio_bitrate  = raw_opts.get("audio_bitrate", "128k"),
        subtitle_style = SubtitleStyle(raw_opts.get("subtitle_style", "default")),
        vaapi_device   = raw_opts.get("vaapi_device", "/dev/dri/renderD128"),
    )

    specs = []
    for c in data.get("clips", []):
        specs.append(ClipSpec(
            input_path    = c["input"],
            start_time    = c["start"],
            end_time      = c["end"],
            output_path   = c["output"],
            subtitle_path = c.get("subtitle"),
            label         = c.get("label"),
        ))

    return specs, opts


# ── CLI 엔트리포인트 ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="최적화된 영상 클립 추출기 (ffmpeg-guide.md 옵션 적용)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  # 스트림 복사 (기본, 무손실)
  python video_clipper.py input.mp4 00:01:30 00:03:15 output.mp4

  # H.264 고품질 재인코딩
  python video_clipper.py input.mp4 90 195 output.mp4 --quality h264 --crf 18

  # 자막 소각 (SRT 하드코딩)
  python video_clipper.py input.mp4 00:00:00 00:05:00 output.mp4 --subtitle subs.srt --sub-style shorts

  # 하드웨어 가속 자동 선택
  python video_clipper.py input.mp4 0 120 output.mp4 --quality auto

  # 배치 처리
  python video_clipper.py --batch clips.json
        """
    )
    parser.add_argument('input',      nargs='?', help='입력 영상 파일')
    parser.add_argument('start',      nargs='?', help='시작 시간 (00:01:30 또는 초)')
    parser.add_argument('end',        nargs='?', help='종료 시간')
    parser.add_argument('output',     nargs='?', help='출력 파일 경로')
    parser.add_argument('--subtitle', '-s',      help='SRT 자막 파일 (소각용)')
    parser.add_argument('--sub-style',           default='default',
                        choices=['default','shorts','caption'], help='자막 스타일')
    parser.add_argument('--quality',  '-q',      default='copy',
                        choices=['copy','h264','h265','vaapi','cuda','auto'],
                        help='인코딩 품질 모드 (기본: copy)')
    parser.add_argument('--crf',      type=int,  default=23,
                        help='H.264/265 CRF 값 (18=고품질, 23=균형, 28=소형파일)')
    parser.add_argument('--preset',              default='fast',
                        choices=['ultrafast','superfast','veryfast','faster','fast','medium','slow','veryslow'],
                        help='H.264 인코딩 속도 프리셋')
    parser.add_argument('--threads',  type=int,  default=0,
                        help='인코딩 스레드 수 (0=자동)')
    parser.add_argument('--batch',               help='배치 처리용 JSON 파일')

    args = parser.parse_args()

    try:
        if args.batch:
            specs, opts = load_batch_json(args.batch)
            results = batch_clip(specs, opts)
            sys.exit(0 if all(r["ok"] for r in results) else 1)

        if not all([args.input, args.start, args.end, args.output]):
            parser.print_help()
            sys.exit(1)

        spec = ClipSpec(
            input_path    = args.input,
            start_time    = args.start,
            end_time      = args.end,
            output_path   = args.output,
            subtitle_path = args.subtitle,
        )
        opts = ClipOptions(
            quality        = QualityMode(args.quality),
            crf            = args.crf,
            preset         = args.preset,
            threads        = args.threads,
            subtitle_style = SubtitleStyle(args.sub_style),
        )
        clip_video(spec, opts)

    except (FileNotFoundError, ValueError, RuntimeError) as e:
        print(f"\n❌ 오류: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️  사용자 중단")
        sys.exit(130)


if __name__ == "__main__":
    main()
