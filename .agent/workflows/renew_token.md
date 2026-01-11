---
description: How to renew GitHub Personal Access Token
---

# 90일 후 토큰 만료 시 갱신 방법

토큰 유효기간(90일)이 만료되면 다시 로그인을 요청할 수 있습니다 . 그때를 대비해 이 가이드를 참고하세요.

## 1. 새 토큰 발급받기
1. [GitHub 토큰 설정 페이지](https://github.com/settings/tokens)로 이동합니다.
2. 기존에 만료된 토큰은 삭제(`Delete`)합니다.
3. 우측 상단 **Generate new token** -> **Generate new token (classic)** 클릭.
4. **Note**: `Renewal Token` 등 입력.
5. **Expiration**: `90 days` 또는 `No expiration` 선택.
6. **Select scopes (중요)**:
   - [x] **`repo`** (이것만 체크하면 됩니다.)
7. 맨 아래 **Generate token** 클릭 후 **`ghp_`로 시작하는 코드 복사**.

## 2. 내 PC에 새 토큰 입력하기
기존에 저장된 만료된 토큰을 지우고 새 토큰을 입력해야 합니다.

1. **자격 증명 관리자** 실행
   - 윈도우 시작 버튼 누르고 "자격 증명 관리자" 또는 "Credential Manager" 검색 후 실행.
2. **Windows 자격 증명** 탭 클릭.
3. 목록에서 `git:https://github.com` 찾아서 클릭.
4. **편집(Edit)** 누르고, 암호 칸에 **새로 복사한 토큰 붙여넣기**.
5. **저장** 클릭.

## 끝!
이제 다시 90일 동안(또는 설정한 기간 동안) 충돌 없이 자동 업로드가 가능합니다.
