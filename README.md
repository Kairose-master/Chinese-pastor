# 讲道中文 · 설교로 배우는 중국어

새오름교회(言盐教会) 주일예배 PPTX를 **설교 요약 + 중국어/한국어 단어 학습 + 9:16 요약 영상**으로
바꾸고, 그것을 브라우저에서 바로 읽고·듣고·외우고·퀴즈로 확인하는 정적 웹사이트입니다.
빌드 도구 없이 HTML/CSS/JS 세 파일과 `data/` 폴더만으로 동작하므로 Vercel, GitHub Pages,
어떤 정적 호스팅에도 그대로 올라갑니다.

```
index.html · assets/            사이트 (해시 라우터, 로컬스토리지, 브라우저 TTS)
data/index.json                 설교 목록 (pipeline/build_index.py 가 생성)
data/sermons/<date>.json        설교 하나 = 병행 단락 + 본문 + 요약 + 단어 + 퀴즈 + 영상 대본
data/videos/<date>.mp4|vtt|srt  9:16 요약 영상, 자막, 장면 타임스탬프(script.json), 포스터
data/bible/                     bolls.life 에서 받은 和合本(CUNPS)·개역한글(KRV) 캐시
data/prompts/                   Gemini 프롬프트 (파이썬과 브라우저 가져오기가 같은 파일 사용)
data/raw/                       PPTX 추출 결과 (Gemini 전 단계)
pipeline/                       파이썬 파이프라인
```

## 사이트 기능

| 메뉴 | 내용 |
|---|---|
| 오늘의 한 문장 | 첫 화면 맨 위. 모든 설교의 핵심 문장·인사말 풀에서 날짜로 하나를 고릅니다. 듣기, 출처 설교 링크, 이미지 카드 만들기, 다른 문장. |
| 성경공부 · 查经 | 66권 아무 구절이나 和合本·개역한글 병행 + 병음. 본문 속 기독교 용어를 용어 사전(약 240개, 12분류)과 연결. 설교 본문 5곳에는 AI 查经单(배경·구조·원어 핵심 단어·해설·관련 구절·나눔 질문·암송·기도). 信望愛·查經資料大全·BibleGateway CUVS 링크. |
| 30초 도전 | 설교의 인사말+핵심 문장 5개를 30초 안에 따라 읽습니다. 브라우저 음성 인식(Chrome·Edge·Safari, zh-CN 또는 ko-KR)이 들은 것과 원문의 글자 일치율로 점수. 인식 미지원 브라우저는 직접 채점. 최고 기록은 기기에 저장, 점수 카드 공유. |
| 예배 전 화면 | `#/screen/<날짜>`: 인사말(중국어·병음·한국어) → 이번 주 말씀 → 한 문장을 전체화면 슬라이드로. ←/→, F 전체화면. 같은 내용을 교회 덱에 끼워 넣을 수 있는 16:9 PPTX(`data/slides/`)로도 제공. |
| 공유 카드 | 설교마다 1080×1350 카드(인사말+금구)와 링크 미리보기용 OG 이미지. 브라우저에서 아무 문장이나 카드로 그려 저장·공유(Web Share). |
| 설교 목록 | 주일 순서 타임라인. 설교는 시리즈이므로 앞 설교의 인용이 다음 설교에서 이어집니다. 업로드되지 않은 7/19·7/26 설교는 점선으로 표시. |
| 요약 · 摘要 | 한 문장(영상 제목), 4–5문장 요약(한·중), 요점 3–5개, Gemini가 찾은 원고 오탈자, 그날 찬양 가사 병행. |
| 본문 · 经文 | 교회 화면 본문(개역개정·和合本) + 병음 + bolls.life 和合本/개역한글과의 차이 표시, 절별 듣기. |
| 병행 읽기 | 단락별 한·중 대조. 모드: 병행 / 한쪽 가리고 클릭해서 확인 / 중문만 / 한글만. 단어장 단어는 본문에 하이라이트. |
| 단어 · 词语 | 중국어 24단어(병음·뜻·품사·HSK·설교 원문 예문·용법 메모·**한자어 다리**: 같은 한자어/비슷/뜻만 같음/한자어 아님), 핵심 문장 8개(따라 읽기), 문형 4개, 중국인 유학생을 위한 한국어 단어 12개. CSV(Anki) 내보내기. |
| 연습 · 练习 | 플래시카드(틀린 카드는 자동으로 복습 대기열에), 퀴즈 10문제(단어 뜻·내용 이해·빈칸). |
| 영상 · 视频 | 9:16 요약 영상 + 장면별 대본(클릭하면 해당 시점으로), MP4/SRT 다운로드. 세 판: **中文 배우기·중국어 나레이션**, **中文 배우기·한국어 나레이션**(화면은 같고 소리만 한국어), **学韩语·韩语版**(역방향: 한국어가 크게, 한국어 단어 5개, 한국어 나레이션 — 중국인 유학생용). 학습 방향에 따라 기본 판이 바뀝니다. |
| 단어장 | 모든 설교의 단어를 합쳐 반복 등장 순으로. HSK·설교별 필터. |
| 복습 | 라이트너 상자(0→1→3→7→14→30일) 간격 반복. 브라우저 로컬스토리지에 저장. |
| 가져오기 | PPTX 또는 JSON을 브라우저에서 파싱. Gemini 키를 넣으면 요약·단어·퀴즈까지 즉석 생성. |

상단 **학습 방향** 스위치로 "한국어 화자 → 중국어" / "中文使用者 → 韩语" 를 바꾸면 요약 언어 순서,
가리기 방향, 단어장·플래시카드·퀴즈의 기준 언어가 모두 뒤집힙니다. 이 교회는 중국인 유학생과
한국인 성도가 함께 예배하므로 양방향이 기본입니다.

## 파이프라인 (새 주일 설교 추가)

```bash
pip install python-pptx pypinyin pillow imageio-ffmpeg     # 1회
sudo apt-get install fonts-noto-cjk                          # 영상 렌더용 CJK 글꼴 (1회)
export GEMINI_API_KEY=...                                    # 요약·단어·TTS

python3 pipeline/extract_pptx.py 20260913_주일예배.pptx -o data/raw/2026-09-13.raw.json
python3 pipeline/enrich.py data/raw/2026-09-13.raw.json      # → data/sermons/2026-09-13.json (Gemini 1회)
python3 pipeline/render_video.py data/sermons/2026-09-13.json # → data/videos/2026-09-13.*   (TTS 14회)
python3 pipeline/render_video.py data/sermons/2026-09-13.json --lang ko   # 한국어 나레이션 판 (.ko.mp4, TTS 14회)
python3 pipeline/render_video.py data/sermons/2026-09-13.json --target ko # 역방향 韩语版 (.rev.mp4, TTS 14회)
python3 pipeline/greeting_slide.py data/sermons/2026-09-13.json           # 예배 전 화면용 인사말 PPTX
python3 pipeline/hanja_bridge.py data/sermons/2026-09-13.json # 한자어 다리 (Gemini 1회)
python3 pipeline/share_card.py data/sermons/2026-09-13.json   # 공유 카드 PNG + OG 이미지
python3 pipeline/study_notes.py "使徒行传 14:21-28"             # 성경공부 노트 (Gemini 1회, 아무 구절)
python3 pipeline/build_index.py                               # → data/index.json
git add data && git commit -m "2026-09-13 설교 추가" && git push
```

- `extract_pptx.py` — 사도신경 헤더 제거, "오늘의 말씀" 뒤 제목 슬라이드부터 마침 찬양 전까지를 설교
  본문으로, 숫자로 시작하는 줄을 성경 구절로, 짧은 두 줄 슬라이드를 찬양 가사로 인식합니다.
  줄바꿈으로 감싼 원고(8/23 양식)는 다시 이어 붙입니다. 유치부 예배(한국어만)도 처리합니다.
- `bible.py` — `python3 pipeline/bible.py "使徒行传 1:12-14"` 로 아무 구절이나 받아 캐시합니다.
- `enrich.py` — `gemini-3.1-pro-preview` JSON 모드. 예문·핵심 문장은 설교 원문에서 그대로 뽑도록
  지시하고, 병음은 `pypinyin`으로 다시 계산합니다. 모델은 `CP_TEXT_MODEL` 환경변수로 바꿉니다.
- `render_video.py` — 장면 카드(Pillow, Noto Sans CJK) + Gemini TTS(`Kore` 목소리, 중국어) + ffmpeg.
  훅 → 제목 → 요약 2 → 요점 3 → 단어 5 → 금구 → 축복, 약 2분. `--no-tts` 로 무음 미리보기,
  `--voice Aoede` 등으로 목소리 변경. VTT/SRT는 같은 타임스탬프로 씁니다.

- `hanja_bridge.py` — 단어마다 한자 표기·한국 한자음·대응 한국어·관계(same/similar/different/none).
- `share_card.py` — 카카오톡·인스타용 카드와 OG 이미지. `build_index.py`가 최신 카드를 `data/cards/latest.og.png`로 복사합니다.
- `glossary.py` — 기독교 중국어 용어 사전 `data/glossary.json` (12분류, Gemini 12회). 다시 만들면 덮어씁니다.
- `study_notes.py` — 구절별 查经单 `data/study/<书名>.<장>.<절>-<절>.json`.

비용: 설교 1편당 Gemini 텍스트 2회 + 영상 한 판당 TTS 14회(세 판이면 42회). TTS 결과는 `data/.cache/tts/`에
캐시되어 카드만 고쳐 다시 렌더할 때는 호출이 없고, 캐시가 없어도 `--reuse-audio`로 이전 렌더의 음성을 잘라 씁니다.
TTS는 모델별 **하루 100회** 한도가 있어 여러 판을 같은 날 만들면 `CP_TTS_MODEL=gemini-3.1-flash-tts-preview`,
`gemini-2.5-pro-preview-tts` 처럼 판마다 다른 TTS 모델로 나눠 쓰세요.

## 브라우저 가져오기

`#/import` 에서 PPTX를 놓으면 JSZip으로 슬라이드 XML을 읽어 위 파이썬 추출기와 같은 규칙으로
단락을 나눕니다(파일은 업로드되지 않습니다). Gemini 키가 있으면 `data/prompts/adult.txt` 프롬프트로
바로 요약·단어·퀴즈를 만들고, 없으면 병행 읽기·본문만 저장됩니다. 저장은 로컬스토리지이고,
설교 페이지의 **JSON 내보내기**로 받은 파일을 `data/sermons/`에 넣고 `build_index.py`를 돌리면
모든 사용자에게 공개됩니다. 영상은 브라우저에서 만들 수 없으므로 위 파이프라인을 사용합니다.

## 배포

정적 사이트입니다. Vercel: 저장소를 연결하면 빌드 명령 없이 그대로 배포됩니다(`vercel.json` 포함).
GitHub Pages: 루트를 그대로 공개하면 됩니다. 로컬 미리보기는 `python3 -m http.server 8765`.

## 출처와 저작권

- 설교 원고·찬양 가사·기도문: 새오름교회 (言盐教会). 학습 목적의 내부 자료.
- 성경: 개역개정(교회 화면), 개역한글 KRV·和合本 CUNPS (bolls.life 공개 API).
- 요약·단어·퀴즈·영상 대본: Gemini 생성 후 원문과 대조. `corrections` 필드에 모델이 찾은 원고 오탈자를 남깁니다.
- JSZip (MIT) `assets/vendor/`. 글꼴은 Google Fonts(Noto Serif SC, Noto Sans SC/KR, IBM Plex Mono).

개선 제안과 발견한 문제는 [IMPROVEMENTS.md](IMPROVEMENTS.md)에 있습니다.
