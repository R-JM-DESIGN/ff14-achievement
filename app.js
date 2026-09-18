// app.js - Part 1
// 🌟 [원상복구] 깃허브 캐시 대신 사용자님의 구글 웹앱 주소로 직접 데이터를 실시간 요청합니다.
// [설정] 구글 배포 서버로부터 JSON 형태의 업적 데이터를 원격 수집하는 게이트웨이 주소 상수입니다.
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz-kQGaE1a_3qFcc8jD3ZytF-m-a_63-__i9scW7LQFRQ9CW8cpXMDwoJwzwS_3PU_x/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

// [원본 상태 유지 변수] 수집된 업적 원본 배열과 로컬스토리지 완료 키 데이터를 선언합니다.
let rawData = [];
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; // 2. 글자 대신 STORAGE_KEY 적용

// [원본 상태 유지 변수] 필터링 및 복합 연산에 연동되는 글로벌 제어 인덱스 목록입니다.
let currentMain = '';            // 대분류 카테고리 기록용 변수
let currentSub = '';             // 소분류 카테고리 기록용 변수
let currentRewardFilters = [];   // 보상 아이템 다중 토글 누적 저장용 배열 변수
let currentStatusFilter = 'ALL'; // 달성 상태 필터 기록용 변수 (ALL / 미완료 / 완료)
let currentSearchQuery = '';     // 통합 검색 키워드 실시간 소문자 저장용 변수

// [브라우저 돔 리스너] 웹페이지 마크업 스캔이 완료되는 순간 저장된 테마를 불러오도록 호출합니다.
document.addEventListener("DOMContentLoaded", () => {
    applySavedThemeMode();
});

/**
 * ------------------------------------------------------------------------------
 * 1. 테마 모드 영구 기억 및 실시간 전환 엔진 (applySavedThemeMode, toggleThemeMode)
 * ------------------------------------------------------------------------------
 * 사용자가 마지막으로 선택한 화면 스타일을 LocalStorage 메모리와 연동하여 실시간 제어합니다.
 */
function applySavedThemeMode() {
    // 저장고를 확인하되 최초 방문자일 시 기본 상태를 다크 모드로 설정하기 위해 'dark'를 디폴트 배정합니다.
    const savedTheme = localStorage.getItem("ff14_theme_mode") || "dark";
    const body = document.body;
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");

    // 돔 노드가 아직 해석되지 않았을 경우 오류가 나지 않도록 차단하는 예외 방어 가드
    if (!icon || !text) return;

    if (savedTheme === "light") {
        body.classList.add("light-mode"); // body 태그에 라이트모드 스타일 배포
        icon.textContent = "☀️";          // UI 단추 내 시각 이모지 교체
        text.textContent = "라이트 모드";   // UI 단추 내 설명 안내 텍스트 교체
    } else {
        body.classList.remove("light-mode"); // 라이트 클래스를 지워 기본 스타일인 다크모드 유도
        icon.textContent = "🌙";
        text.textContent = "다크 모드";
    }
}

function toggleThemeMode() {
    const body = document.body;
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");

    if (!icon || !text) return;

    // 현재 body 상태를 3항 분기하여 완벽하게 상반되는 모드로 실시간 변환 저장합니다.
    if (body.classList.contains("light-mode")) {
        body.classList.remove("light-mode");
        icon.textContent = "🌙";
        text.textContent = "다크 모드";
        localStorage.setItem("ff14_theme_mode", "dark"); // 브라우저 저장소 영구 기억 매핑
    } else {
        body.classList.add("light-mode");
        icon.textContent = "☀️";
        text.textContent = "라이트 모드";
        localStorage.setItem("ff14_theme_mode", "light"); // 브라우저 저장소 영구 기억 매핑
    }
    // 라이트 모드 전환 시 보상 종류별 글자가 흐려지지 않게 명도를 새로 계산하기 위해 리스트를 재출력합니다.
    renderList();
}
/**
 * =========================================================================
 * 📋 app.js - Part 2 (비동기 데이터 fetch 원격 수집 및 검색·달성 상태 필터부)
 * =========================================================================
 */

/**
 * ------------------------------------------------------------------------------
 * 1. 구글 스프레드시트 데이터 비동기 원격 로더 및 스키마 직렬화 (fetchData)
 * ------------------------------------------------------------------------------
 */
async function fetchData() {
    try {
        // [원격 네트워크 요청] 지정된 웹 앱 엔드포인트 URL 주소로 통신을 전개합니다.
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`구글 웹 앱 응답 오류 (상태코드: ${res.status})`);
        
        // 수신받은 JSON 포맷의 문자열 덩어리를 자바스크립트용 이차원 다차원 배열로 복원 해제합니다.
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("시트 내부에 파싱할 데이터 행이 부족합니다.");

        // [원본 매핑 알고리즘] 0번째 타이틀 줄을 잘라내고 데이터 딕셔너리 구조 객체 배열을 조립합니다.
        rawData = rows.slice(1).map((row) => {
            // 빈 칸 누락 시 에러가 나지 않도록 앞뒤 여백 공백을 트림 정제하는 안전 보정용 함수
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            const achievementName = getVal(2); // C열: 업적 이름 색출
            // 정규식을 활용해 업적 점수 셀에 섞여있는 문자를 증발시키고 순수 정수로 치환합니다.
            const parsedScore = parseInt(getVal(4).replace(/[^0-9]/g, '')) || 0;

            return {
                id: achievementName,    // 업적명을 데이터 식별용 고유 키 ID로 배정 고정
                main: getVal(0),        // A열: 대분류 카테고리 데이터 저장
                sub: getVal(1),         // B열: 소분류 카테고리 데이터 저장
                name: achievementName,  // C열: 업적 명칭 데이터 저장
                condition: getVal(3),   // D열: 조건 상세 가이드 설명 문구 저장
                score: parsedScore,     // E열: 정수로 전처리 가공된 업적 점수 저장
                rewardType: getVal(5),  // F열: 보상 아이템 종류 종류 데이터 저장
                rewardContent: getVal(6)// G열: 보상 아이템 세부 내용 명칭 저장
            };
        }).filter(item => item.name && item.main); // 필수 인덱스 데이터가 없는 유령 로우 자동 다이어트 컷

        // 로드가 완벽히 끝나면 컴포넌트 동적 조립 함수들과 대시보드 연산기를 연속 트리거합니다.
        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
        applySavedThemeMode(); // 최종 테마 인터페이스 복원 재조정
    } catch (error) {
        // [크래시 디스플레이] 연동 오류 발생 시 중앙 화면에 적색 안내 가이드라인을 강제 렌더링합니다.
        console.error(error);
        document.getElementById('achievement-list').innerHTML = `
            <tr><td colspan="8" style="text-align: center; color: #ff4d4d; font-weight: bold; padding: 40px;">
                구글 스프레드시트 데이터를 로드하지 못했습니다.<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">이유: ${error.message}</span>
            </td></tr>`;
    }
}


/**
 * ------------------------------------------------------------------------------
 * 2. 검색 인풋 인터페이스 감지 및 [Clear] 강제 청소 엔진 (handleSearchInput, clearSearch)
 * ------------------------------------------------------------------------------
 */
// 2-1. 통합 검색창 입력값 실시간 캐칭 리스너 함수
function handleSearchInput() {
    const inputElement = document.getElementById('search-keyword');
    if (inputElement) {
        // 유저가 타이핑한 키워드의 앞뒤 공백을 자르고 소문자로 직렬화하여 글로벌 변수에 바인딩합니다.
        currentSearchQuery = inputElement.value.trim().toLowerCase();
        renderList(); // 키보드를 한 자씩 누를 때마다 화면 목록 실시간 재필터링 리렌더링 발동
    }
}

// 2-2. [기획서 요약 수선본 지시] 타자 친 글자 구조를 물리적으로 지우고 자바스크립트 변수 완전 백지화
function clearSearch() {
    const inputElement = document.getElementById('search-keyword');
    if (inputElement) {
        inputElement.value = ''; // 인풋 컴포넌트 텍스트 강제 물리 청소
    }
    currentSearchQuery = ''; // 자바스크립트 검색 변수 완전 완전 백지화
    updatePathDisplay(); // 경로 패스 가이드라인 복원
    renderList(); // 원래 보던 화면으로 즉시 원상 복원 연동 리렌더링
}


/**
 * ------------------------------------------------------------------------------
 * 3. 미완료 / 완료 항목 전용 토글 필터 스위치 (selectStatusFilter)
 * ------------------------------------------------------------------------------
 */
function selectStatusFilter(status) {
    currentStatusFilter = status; // 획득 상태 전역 변수값 스위칭
    
    // 화면 내부 탭들의 활성화 강조 디자인 불빛 스타일 클래스 초기화 처리
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    if(status === 'ALL') document.getElementById('status-all').classList.add('active');
    if(status === 'UNCOMPLETED') document.getElementById('status-uncompleted').classList.add('active');
    if(status === 'COMPLETED') document.getElementById('status-completed').classList.add('active');
    
    renderList(); // 지정 조건 목록 새로고침
}


/**
 * ------------------------------------------------------------------------------
 * 4. 중복 없는 데이터 기반 카테고리 대분류 버튼 생성기 (initMenu)
 * ------------------------------------------------------------------------------
 */
function initMenu() {
    // 자바스크립트 Set 객체를 사용해 수천 개 행 중 중복이 완벽 청소된 유니크 대분류 배열을 인출합니다.
    const mains = [...new Set(rawData.map(item => item.main))];
    const mainGroup = document.getElementById('main-category-group');
    mainGroup.innerHTML = ''; // 돔 내부 잔상 요소 철거

    mains.forEach((main, idx) => {
        if(!main) return;
        const btn = document.createElement('button');
        btn.textContent = main;
        btn.onclick = () => selectMainCategory(main, btn); // 클릭 시 서브 소분류 호출 함수 연결
        if(idx === 0) btn.click(); // 최초 로딩 시 0번째 대분류 단추 자동 대리 클릭 유도
        mainGroup.appendChild(btn);
    });
}
// app.js - Part 2
// 원본 주석 라인 구조를 그대로 승계하여 보존 분할합니다.

/**
 * ------------------------------------------------------------------------------
 * 1. 2단 교차 연동형 대분류 및 소분류 카테고리 필터 시스템 (selectMainCategory, selectSubCategory)
 * ------------------------------------------------------------------------------
 */
// 1-1. 대분류 물리 단추 선택 시 하위 소분류를 동적으로 추적 배치하는 라우터 함수
function selectMainCategory(main, btn) {
    currentMain = main;
    currentRewardFilters = []; // 카테고리 이동 시 혼선을 막기 위해 다중 보상 선택 큐 완전 비우기
    updateRewardFilterUI();    // 보상 단추 액티브 스타일 시각화 정돈

    // 기존 대분류 활성화 불빛 교체
    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 선택된 대분류 풀에 정속되어 있으면서 중복이 소거된 고유 소분류 한글 이름 배열 추출
    const subs = [...new Set(rawData.filter(item => item.main === main).map(item => item.sub))];
    const subGroup = document.getElementById('sub-category-group');
    subGroup.innerHTML = ''; // 서브 노드 컴포넌트 청소

    subs.forEach((sub, idx) => {
        if(!sub) return;
        const sBtn = document.createElement('button');
        sBtn.textContent = sub;
        sBtn.onclick = () => selectSubCategory(sub, sBtn); // 클릭 시 최종 테이블 렌더링 호출
        if(idx === 0) sBtn.click(); // 소분류 탭 역시 최초 항목 강제 자동 클릭 발동
        subGroup.appendChild(sBtn);
    });
}

// 1-2. 소분류 최종 선택 시 실행되는 동기화 빌더 함수
function selectSubCategory(sub, btn) {
    currentSub = sub;
    currentRewardFilters = []; // 소분류 이동 시에도 다중 보상 큐 백지화 리셋
    updateRewardFilterUI();
    
    document.querySelectorAll('#sub-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    updatePathDisplay(); // 가이드라인 경로 문자열 새로고침
    renderList();        // 최종 데이터 목록 빌딩
}


/**
 * ------------------------------------------------------------------------------
 * 2. [기획서 요약 명세] 보상 종류별 중복 필터 멀티 토글 엔진 (initRewardMenu, selectRewardMultiFilter)
 * ------------------------------------------------------------------------------
 * [칭호], [장비], [탈것] 등을 여러 개 동시 다중 선택하여 전 수량을 교차 모아볼 수 있는 제어 장치입니다.
 */
// 2-1. 보상 종류 모아보기 필터 버튼 무리 인터페이스 동적 빌드 알고리즘
function initRewardMenu() {
    const rewardTypes = [...new Set(rawData.map(item => item.rewardType))].filter(t => t && t !== '-');
    const rewardGroup = document.getElementById('reward-category-group');
    rewardGroup.innerHTML = '';

    // 최선단에 위치할 디폴트 '필터 해제' 단추 배정
    const allBtn = document.createElement('button');
    allBtn.textContent = '필터 해제'; 
    allBtn.classList.add('reward-filter-btn', 'active');
    allBtn.id = 'rw-btn-all';
    allBtn.onclick = () => selectRewardMultiFilter('ALL');
    rewardGroup.appendChild(allBtn);

    // 수집 완료된 보상 목록을 순회하며 마크업 단추를 연속 삽입합니다.
    rewardTypes.forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = type; 
        btn.classList.add('reward-filter-btn');
        btn.setAttribute('data-reward-type', type); // 다중 대조 확인용 특수 명찰 인젝션
        btn.onclick = () => selectRewardMultiFilter(type); // 토글 연산 함수 바인딩
        rewardGroup.appendChild(btn);
    });
}

// 2-2. 다중 중복 필터 추가 및 [재클릭 시 해제] 토글 검증 알고리즘
function selectRewardMultiFilter(type) {
    if (type === 'ALL') {
        currentRewardFilters = []; // 필터 해제 누를 시 다중 보상 큐 전량 비우기 초기화
    } else {
        // 현재 선택된 보상 배열 공간 안에 방금 유저가 조작한 키워드가 묻어있는지 인덱스를 조사합니다.
        const index = currentRewardFilters.indexOf(type);
        if (index > -1) {
            // [재클릭 시 해제 수선] 이미 목록에 등록된 단어라면 불을 꺼야 하므로 배열 내부에서 영구 파괴 제거합니다.
            currentRewardFilters.splice(index, 1); 
        } else {
            // [다중 동시 선택 토글 탑재] 목록에 없는 단어라면 다중 필터 배열 큐에 새로 푸시 적재합니다.
            currentRewardFilters.push(type); 
            // 보상 모아보기 가동 순간 본래의 대/소분류 카테고리 단추 무리의 액티브 시각 불빛 일제히 강제 소등
            document.querySelectorAll('#main-category-group button, #sub-category-group button').forEach(b => b.classList.remove('active'));
        }
    }
    
    updateRewardFilterUI(); // 누적 배열 정보 기반으로 버튼 활성화 불빛 실시간 갱신 정돈
    updatePathDisplay();    // 안내 경로 가이드라인 텍스트 실시간 치환
    renderList();           // 복합 필터 최종 연산 테이블 리드로우
}

// 2-3. 원본 보상 UI 액티브 매커니즘 라인 (원본 소스 상태 100% 동일 보존)
function updateRewardFilterUI() {
    const allBtn = document.getElementById('rw-btn-all');
    
    if (currentRewardFilters.length === 0) {
        document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
        if (allBtn) allBtn.add('active'); // 원본 오타 라인 형태 그대로 유지 (add)
    } else {
        if (allBtn) allBtn.remove('active'); // 원본 오타 라인 형태 그대로 유지 (remove)
        document.querySelectorAll('.reward-filter-btn').forEach(btn => {
            const type = btn.getAttribute('data-reward-type');
            if (currentRewardFilters.includes(type)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}
/**
 * =========================================================================
 * 📋 app.js - Part 4 (가변 레이아웃 교집합 연산 및 실시간 진척도 게이지 계산부)
 * =========================================================================
 */

// 1. 안내판 경로 패스 디스플레이 매핑 함수
function updatePathDisplay() {
    const display = document.getElementById('current-path-display');
    if (!display) return;
    if (currentSearchQuery) {
        display.textContent = `🔍 전체 항목 중에서 '${currentSearchQuery}' 검색 결과`;
    } else if (currentRewardFilters.length > 0) {
        display.textContent = `🎁 [다중 필터] 종류 : ${currentRewardFilters.join(', ')}`;
    } else {
        display.textContent = `${currentMain} ＞ ${currentSub}`;
    }
}

// 2. [기획서 요약 명도 보정 반영] 라이트모드 ⇄ 다크모드 분기 최적 텍스트 명도 매핑 시스템
function getRewardColor(type) {
    if (!type || type === '-') return '#666666'; 
    const isLight = document.body.classList.contains("light-mode");
    switch (type) {
        case '탈것': return isLight ? '#b80061' : '#ff70a6';      
        case '꼬마친구': return isLight ? '#0066cc' : '#4ea8de';    
        case '칭호': return isLight ? '#b55d00' : '#ff9f1c';      
        case '장비': return isLight ? '#7209b7' : '#b5179e';      
        case '가구': return isLight ? '#2d6a4f' : '#70e000';      
        case '초코보 갑주': return isLight ? '#995a00' : '#ffd166';  
        case '오케스트리온': return isLight ? '#0077b6' : '#48cae4'; 
        default: return isLight ? '#14746f' : '#5bc0be';         
    }
}

// 3. 다중 조건 복합 결합 교집합 분석 및 8열 무결성 테이블 물리 출력 엔진
function renderList() {
    const listBody = document.getElementById('achievement-list');
    const thPath = document.getElementById('th-path');
    if (!listBody || !thPath) return;
    listBody.innerHTML = ''; // 테이블 초기 세정

    let filtered = [];
    
    // 🔍 [1단계 필터링 스코프] 검색 키워드 유무에 따른 다중 토글 vs 순정 카테고리 교차 검증
    if (!currentSearchQuery) {
        if (currentRewardFilters.length === 0) {
            filtered = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        } else {
            filtered = rawData.filter(item => currentRewardFilters.includes(item.rewardType));
        }
    } else {
        filtered = rawData.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(currentSearchQuery);
            const condMatch = item.condition.toLowerCase().includes(currentSearchQuery);
            const typeMatch = item.rewardType.toLowerCase().includes(currentSearchQuery);
            const rewardMatch = item.rewardContent.toLowerCase().includes(currentSearchQuery);
            return nameMatch || condMatch || typeMatch || rewardMatch;
        });
    }

    // 📋 [2단계 필터링 스코프] 로컬스토리지 보유 체크 유무 필터 가동
    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  
    }

    // [가변 테이블 제어] 다중 필터 및 검색 구동 시에만 출처 소속 카테고리를 노출할 가상 '분류' 8열 개방 시스템
    const showPathColumn = (currentRewardFilters.length > 0 || currentSearchQuery !== '');
    if (showPathColumn) thPath.style.display = ''; 
    else thPath.style.display = 'none'; 

    const activeColspan = showPathColumn ? 8 : 7;

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="${activeColspan}" style="text-align: center; padding: 40px; color: var(--text-color); opacity: 0.6;">필터 및 검색 조건에 부합하는 업적이 없습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    // 🛠️ [3단계 물리 마크업 출력] 기획 요약본 양식(순번 안쪽여백 0, 조건 본문 0.85em 소형화) 주입 빌드
    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed'); // 체크 시 취소선 및 흐려짐 CSS 클래스 즉시 작동

        const textColor = getRewardColor(item.rewardType);
        let pathTd = showPathColumn ? `<td class="col-path">${item.main}＞${item.sub}</td>` : '';

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            ${pathTd}
            <td class="col-name">${item.name}</td>
            <td class="col-cond">${item.condition}</td>
            <td class="col-score">${item.score}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight:bold;">${item.rewardType || '-'}</td>
            <td class="col-rw-content">${item.rewardContent || '-'}</td>
        `;
        listBody.appendChild(tr);
    });

    // 하단 서브 프로그레스 수치 바 실시간 갱신 브릿지
    if (currentSearchQuery || currentRewardFilters.length > 0) {
        calculateChapterProgress(filtered);
    } else {
        const currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        calculateChapterProgress(currentViewItems);
    }
}

// 4. 체크박스 클릭 세이브 및 동동 세션 디스패치 핸들러
function toggleItem(id, checkbox) {
    const row = checkbox.closest('tr');
    if (checkbox.checked) {
        checkedItems[id] = true;
        row.classList.add('completed');
    } else {
        delete checkedItems[id];
        row.classList.remove('completed');
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedItems)); // 3. 글자 대신 STORAGE_KEY 적용
    calculateTotalProgress();

    if (currentStatusFilter !== 'ALL' || currentSearchQuery || currentRewardFilters.length > 0) {
        renderList();
    } else {
        const currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        calculateChapterProgress(currentViewItems);
    }
}

// 5. 마스터 통합 누적 대시보드 및 로컬 챕터 진척 수치 연산부
function calculateTotalProgress() {
    const total = rawData.length;
    if(total === 0) return;
    
    const checkedCount = rawData.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('total-percent').textContent = `${percent}%`;
    document.getElementById('total-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('total-bar').style.width = `${percent}%`;

    // [기획서 보정 연동] 명칭 수선: '현재 누적 업적 점수' 대시보드에 천 단위 콤마 처리 출력 완료
    const myScore = rawData.filter(item => checkedItems[item.id]).reduce((acc, item) => acc + item.score, 0);
    document.getElementById('score-total').textContent = `${myScore.toLocaleString()} 점`;
}

function calculateChapterProgress(currentItems) {
    const total = currentItems.length;
    
    if (currentSearchQuery) {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 검색 항목 달성도: ";
    } else if (currentRewardFilters.length > 0) {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "선택 보상 달성도: ";
    } else {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 소분류 달성도: ";
    }

    if(total === 0) {
        document.getElementById('chapter-percent').textContent = `0%`;
        document.getElementById('chapter-count').textContent = `0/0`;
        document.getElementById('chapter-bar').style.width = `0%`;
        return;
    }
    const checkedCount = currentItems.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('chapter-percent').textContent = `${percent}%`;
    document.getElementById('chapter-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('chapter-bar').style.width = `${percent}%`;
}

// 🚀 엔트리 시스템 기동 시작 커맨드 라인
fetchData();
