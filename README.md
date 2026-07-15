# Cinema Director AI

조회수 극대화 기획 분석 & 멀티플랫폼 벤치마킹 대시보드

영상 크리에이터를 위한 AI 기획·마케팅 분석, 레퍼런스 벤치마킹, 유행 영상 추천 도구입니다.

## 주요 기능

- **멀티 소스 비디오 로딩** — 로컬 영상 업로드, YouTube/직접 URL 연동
- **실시간·자동 컷 캡처** — 수동 캡처 + 10/20/30컷 자동 캡처
- **Gemini AI 분석** — 트렌드·공감대·타겟·아이디어·조회유도력 평가
- **멀티플랫폼 벤치마킹** — YouTube / Instagram / TikTok 레퍼런스 비교
- **유행 영상 추천** — 키워드 기반 YouTube 인기·급상승 영상 3~5개

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## API 키 설정

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 **Gemini API 키** 발급 (필수)
2. [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com)에서 **YouTube Data API** 활성화 후 API 키 발급 (선택, 실제 레퍼런스·유행 영상 검색용)
3. 앱 우측 상단 ⚙️ 설정에서 키 등록
4. 키는 브라우저 **localStorage**에만 저장됩니다 (서버에 저장되지 않음)

> YouTube 임베드 영상은 CORS 제한으로 프레임 캡처가 불가합니다. 로컬 파일 또는 직접 비디오 URL(.mp4)을 사용해 주세요.

## GitHub + Vercel 배포

### 1단계: GitHub에 올리기

프로젝트 폴더에서 PowerShell 실행:

```powershell
cd C:\Users\user\Projects\cinema-director-ai

# 최초 1회만
git add .
git commit -m "Initial commit: Cinema Director AI"

# GitHub에서 새 저장소 생성 (https://github.com/new)
# 이름 예: cinema-director-ai  /  Public 또는 Private 선택
# README 추가하지 말고 빈 저장소로 생성

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cinema-director-ai.git
git push -u origin main
```

`YOUR_USERNAME`을 본인 GitHub 아이디로 바꿔 주세요.

### 2단계: Vercel에 배포

1. [vercel.com](https://vercel.com) 로그인 (GitHub 계정 연동 권장)
2. **Add New → Project**
3. 방금 올린 `cinema-director-ai` 저장소 **Import**
4. 설정 확인 (대부분 자동 감지됨):

| 항목 | 값 |
|------|-----|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

5. **Environment Variables** — 이 앱은 서버 환경변수가 **필요 없습니다**. API 키는 사용자가 배포된 사이트에서 직접 설정합니다.
6. **Deploy** 클릭

배포 완료 후 `https://cinema-director-ai-xxxx.vercel.app` 같은 URL이 생성됩니다.

### 3단계: YouTube API 키 도메인 허용 (중요)

배포 후 YouTube 검색이 안 되면 Google Cloud Console에서 API 키 제한을 수정해야 합니다.

1. [Google Cloud Console → API 및 서비스 → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)
2. YouTube Data API 키 선택 → **애플리케이션 제한사항**
3. **HTTP 리퍼러(웹사이트)** 선택 후 아래 추가:

```
http://localhost:5173/*
https://*.vercel.app/*
https://your-custom-domain.com/*
```

4. 저장 후 5~10분 뒤 배포 사이트에서 다시 테스트

Gemini API 키도 [Google AI Studio](https://aistudio.google.com/apikey)에서 사용량·제한을 확인해 주세요.

### 이후 업데이트 배포

코드 수정 후:

```powershell
git add .
git commit -m "업데이트 내용 설명"
git push
```

Vercel이 GitHub push를 감지해 **자동으로 재배포**합니다.

## 기술 스택

- React 18 + TypeScript + Vite
- Google Gemini 2.5 Flash
- YouTube Data API v3
- Recharts · Lucide React
