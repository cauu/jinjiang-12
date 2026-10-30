#!/bin/sh
set -eu
ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"
source_image="production/jinshi-acceptance-v1/source/intro-keyframe-v1.png"
source_audio="packages/game-client/src/assets/jinshi/audio/market-loop-v1.wav"
output="assets/video/jinshi-intro-v1.mp4"
phone="assets/video/jinshi-intro-v1_phone.mp4"
"$ffmpeg_bin" -hide_banner -loglevel error -n -loop 1 -framerate 30 -i "$source_image" -i "$source_audio" -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.0+0.00022*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30[v];[1:a]afade=t=in:st=0:d=1,afade=t=out:st=14:d=1[a]" -map '[v]' -map '[a]' -t 15 -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$output"
cp -n "$output" "$phone"
