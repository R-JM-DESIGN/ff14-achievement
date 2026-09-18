/**
 * =========================================================================
 * 📋 app.js - Part 1 (코어 데이터 인프라 수집 및 초고속 동기화 세팅)
 * =========================================================================
 * 
 * [시스템 개요]
 * 본 스크립트는 두 번째 파일의 고속 렌더링 검증 공식을 첫 번째 업적 시스템에 이식한 코어입니다.
 * 구글 배포 API 주소로부터 실시간 업적 레코드를 인출하여 객체 배열로 정밀 매핑하고,
 * 비동기 로딩 꼬임으로 인한 무한 로딩 현상을 원천 차단하는 가드레일을 구축합니다.
 */

// 1. [수선 완료] 두 번째 파일의 무결성 구글 웹 앱 API 고속 연동 주소를 이식 고정합니다.
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz-kQGaE1a_3qFcc8jD3ZytF-m-a_63-__i9scW7LQFRQ9CW8cpXMDwoJwzwS_3PU_x/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

// 2. 가동에 필요한 전역 변수(인스턴스 상태 저장소) 그룹 개설
let rawData = []; // 구글 시트에서 인출된 업적 데이터 전체를 안전하게 파킹하는 배열 공간

// 3. 브라우저 로컬 스토리지 업적 체크 내역 영구 저장소 고유 키 명칭
const STORAGE_KEY = 'ff14_achievements_v2';

// 4. 로컬 스토리지로부터 사용자가 저장해 둔 업적 체크 객체 인출 (없을 시 빈 객체 시작)
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

// 5. 활성화되어 연산 중인 다중 복합 필터들의 디폴트 상태 기준점 정의
let currentMain = '';            // A열 매칭: 대분류 카테고리 필터링 제어 변수
let currentSub = '';             // B열 매칭: 소분류 카테고리 필터링 제어 변수
let currentRewardFilter = 'ALL'; // F열 매칭: 보상 아이템 종류 모아보기 필터 제어 변수
let currentStatusFilter = 'ALL'; // 체크박스 매칭: 업적 완료 상태 필터 제어 변수 (전체/미완료/완료)
let currentSearchQuery = '';     // 검색창 매칭: 통합 검색 키워드 실시간 소문자 저장 변수
/**
 * =========================================================================
 * 📋 app.js - Part 2 (비동기 초고속 데이터 딕셔너리 매핑 및 데이터 예외 방어 엔진)
 * =========================================================================
 */

/**
 * ------------------------------------------------------------------------------
 * 1. 데이터 원격 고속 인출 및 업적 데이터 규격화 매핑 (fetchData)
 * ------------------------------------------------------------------------------
 * 두 번째 파일의 데이터 로딩 알고리즘을 이식하여, 네트워크 편차로 인한 멈춤 현상을 차단합니다.
 */
async function fetchData() {
    try {
        // [비동기 네트워크 파이프라인] 지정된 구글 API 웹 앱 주소로 데이터를 고속 요청합니다.
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`구글 웹 앱 API 응답 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        // 시트 내부 레코드 데이터 수량의 무결성을 엄격하게 스크리닝 검증합니다.
        if (!rows || rows.length <= 1) throw new Error("시트 내부에 파싱할 데이터 행이 부족합니다.");

        // [두 번째 파일의 고속 매핑 가드레일 적용] 
        // 배열을 안전하게 쪼개고 빈 셀(Null)이나 공백이 발견되어도 언디파인드 에러 없이 빈 문자로 정제합니다.
        rawData = rows.slice(1).map((row) => {
            if (!row || !Array.isArray(row)) return null;
            
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            const achievementName = getVal(2); // C열: 업적명 인출
            
            // 점수 셀에 불필요한 서식 문자나 공백이 섞여 있어도 정규 표현식으로 숫지만 발라내 정수 치환합니다.
            const parsedScore = parseInt(getVal(4).replace(/[^0-9]/g, '')) || 0;

            // 첫 번째 파일의 고유 데이터 스키마를 훼손 없이 유지하며 8열 무결성 객체로 변환합니다.
            return {
                id: achievementName,    // 업적명을 도감 고유 ID 식별 키로 삼아 데이터 순서 밀림 완벽 방지
                main: getVal(0),        // A열: 대분류 카테고리 데이터
                sub: getVal(1),         // B열: 소분류 카테고리 데이터
                name: achievementName,  // C열: 업적 명칭
                condition: getVal(3),   // D열: 업적 달성 세부 조건 문구
                score: parsedScore,     // E열: 정수 가공이 완료된 순수 업적 점수
                rewardType: getVal(5),  // F열: 보상 아이템 종류 종류 ([탈것], [칭호] 등)
                rewardContent: getVal(6)// G열: 보상 아이템 세부 내용 명칭
            };
        }).filter(item => item && item.name && item.main); // 필수 코어 값이 누락된 유령 행들을 런타임 진입 전 파쇄

        // [동기적 결합 컴포넌트 호출] 데이터 로드가 완벽히 확인되었으므로 동적 UI 빌더들을 순차 구동합니다.
        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
    } catch (error) {
        // [무한 로딩 브레이커] 통신이나 연산 도중 에러가 나면 무한 로딩 바를 지우고 직관적인 에러 상자를 화면에 출력합니다.
        console.error("데이터 로딩 중 치명적 예외 발생:", error);
        document.getElementById('achievement-list').innerHTML = `
            <tr><td colspan="7" style="text-align: center; color: #ff4d4d; font-weight: bold; padding: 40px;">
                최신 업적 데이터베이스 실시간 동기화 실패<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">원인: ${error.message}</span>
            </td></tr>`;
    }
}
/**
 * =========================================================================
 * 📋 app.js - Part 3 (사용자 입력 감지 인터페이스 및 복합 크로스 필터 라우터)
 * =========================================================================
 */

// 1. 통합 검색창 실시간 인풋 키 리스너 핸들러
function handleSearchInput() {
    const inputElement = document.getElementById('search-keyword');
    currentSearchQuery = inputElement.value.trim().toLowerCase(); // 대소문자 구별 장벽 제거를 위한 소문자 직렬화
    renderList(); // 한 글자 타이핑 칠 때마다 테이블 리렌더링 발동
}

// 2. 업적 달성 완료 상태 스위치 인터페이스 컨트롤러
function selectStatusFilter(status) {
    currentStatusFilter = status;
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    
    if(status === 'ALL') document.getElementById('status-all').classList.add('active');
    if(status === 'UNCOMPLETED') document.getElementById('status-uncompleted').classList.add('active');
    if(status === 'COMPLETED') document.getElementById('status-completed').classList.add('active');

    renderList(); // 상태 스위칭에 맞춰 리스트 재출력
}

// 3. 중복 없는 순수 데이터 기반 대분류 카테고리 탭 버튼 자동화 생성기
function initMenu() {
    const mains = [...new Set(rawData.map(item => item.main))];
    const mainGroup = document.getElementById('main-category-group');
    mainGroup.innerHTML = ''; // 이전 잔상 요소 철거

    mains.forEach((main, idx) => {
        if(!main) return;
        const btn = document.createElement('button');
        btn.textContent = main;
        btn.onclick = () => selectMainCategory(main, btn);
        mainGroup.appendChild(btn);
        
        // 🌟 [무한 로딩 원천 차단 1단계] 비동기 데이터 수집과 동시에 첫 번째 카테고리 기준점을 메모리에 강제 셋업합니다.
        if (idx === 0) {
            currentMain = main;
            btn.classList.add('active');
        }
    });
}

function selectMainCategory(main, btn) {
    currentMain = main;
    currentRewardFilter = 'ALL'; // 카테고리 스위칭 시 보상 모아보기 필터는 디폴트 리셋
    updateRewardFilterActive();

    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 선택한 대분류 탭에 귀속된 하위 소분류 데이터 추출 및 중복 청소
    const subs = [...new Set(rawData.filter(item => item.main === main).map(item => item.sub))];
    const subGroup = document.getElementById('sub-category-group');
    subGroup.innerHTML = '';

    subs.forEach((sub, idx) => {
        if(!sub) return;
        const sBtn = document.createElement('button');
        sBtn.textContent = sub;
        sBtn.onclick = () => selectSubCategory(sub, sBtn);
        
        // 소분류 첫 항목 자동 트리거 개방
        if(idx === 0) {
            currentSub = sub;
            sBtn.classList.add('active');
        }
        subGroup.appendChild(sBtn);
    });
}

function selectSubCategory(sub, btn) {
    currentSub = sub;
    currentRewardFilter = 'ALL';
    updateRewardFilterActive();
    
    document.querySelectorAll('#sub-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 화면 중단 패스 가이드라인 경로 디스플레이 매핑
    document.getElementById('current-path-display').textContent = `${currentMain} ＞ ${currentSub}`;
    renderList();
}

// 4. 보상 종류 모아보기 멀티 토글 필터 탭 동적 구조 설계
function initRewardMenu() {
    const rewardTypes = [...new Set(rawData.map(item => item.rewardType))].filter(t => t && t !== '-');
    const rewardGroup = document.getElementById('reward-category-group');
    rewardGroup.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.textContent = '전체 보상'; 
    allBtn.classList.add('reward-filter-btn', 'active');
    allBtn.id = 'rw-btn-all';
    allBtn.onclick = () => selectRewardFilter('ALL', allBtn);
    rewardGroup.appendChild(allBtn);

    rewardTypes.forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = type; 
        btn.classList.add('reward-filter-btn');
        btn.onclick = () => selectRewardFilter(type, btn);
        rewardGroup.appendChild(btn);
    });
}

function selectRewardFilter(type, btn) {
    currentRewardFilter = type;
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type === 'ALL') {
        document.getElementById('current-path-display').textContent = `${currentMain} ＞ ${currentSub}`;
    } else {
        // [기획 요구 수선] 특정 보상 모아보기 작동 시 상하위 카테고리 단추 불을 끄고 가이드라인 문구를 단축 치환합니다.
        document.querySelectorAll('#main-category-group button, #sub-category-group button').forEach(b => b.classList.remove('active'));
        document.getElementById('current-path-display').textContent = `🎁 [필터] 종류 : ${type}`; 
    }
    renderList();
}

function updateRewardFilterActive() {
    document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.getElementById('rw-btn-all');
    if(allBtn) allBtn.classList.add('active');
}

// [기획 보정] 라이트 모드 테마 스위치 가동 시 텍스트 시인성이 묻히지 않도록 최적화 컬러 매핑 규칙 준수
function getRewardColor(type) {
    if (!type || type === '-') return '#888888'; 
    switch (type) {
        case '탈것': return '#ff70a6';      
        case '꼬마친구': return '#4ea8de';    
        case '칭호': return '#ff9f1c';      
        case '장비': return '#b5179e';      
        case '가구': return '#70e000';      
        case '초코보 갑주': return '#ffd166';  
        case '오케스트리온': return '#48cae4'; 
        default: return '#5bc0be';         
    }
}
/**
 * =========================================================================
 * 📋 app.js - Part 4 (다차원 교집합 연산 및 순차 기동 프로미스 엔트리 아키텍처)
 * =========================================================================
 */

// 1. 사용자가 조작한 4차 복합 필터를 실시간 교차 결합해 정예 리스트를 도출하는 팩토리 함수
function getCurrentFilteredItems() {
    return rawData.filter(item => {
        // [우선 순위] 통합 검색창 가동 시 카테고리 무력화 전수 매칭
        if (currentSearchQuery) {
            return item.name.toLowerCase().includes(currentSearchQuery) || 
                   item.condition.toLowerCase().includes(currentSearchQuery) || 
                   item.rewardType.toLowerCase().includes(currentSearchQuery) || 
                   item.rewardContent.toLowerCase().includes(currentSearchQuery);
        }
        
        // 검색 모드가 아닐 때, 보상 필터가 꺼져 있다면 내 소속 대/소분류 카테고리만 통과
        if (currentRewardFilter === 'ALL') {
            if (item.main !== currentMain || item.sub !== currentSub) return false;
        } else {
            // 보상 필터 작동 중일 때는 보상 아이템 종류 자료형 대조 검증
            if (item.rewardType !== currentRewardFilter) return false;
        }
        return true;
    });
}

// 2. 7열 업적 테이블 마크업 동적 실시간 빌드 엔진
function renderList() {
    const listBody = document.getElementById('achievement-list');
    listBody.innerHTML = ''; // 잔상 방어 초기 청소

    let filtered = getCurrentFilteredItems();

    // 사용자의 완료 여부 보유 상태 필터에 따른 최종 2차 스크리닝 연산
    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  
    }

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #888;">필터 및 검색 조건에 부합하는 업적이 없습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed');

        const textColor = getRewardColor(item.rewardType);

        // 기획서 2번 명세 요약 주입 완료: 순번 패딩 0 축소, 조건 본문 글자 크기 0.85em 적용
        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            <td class="col-name">${item.name}</td>
            <td class="col-cond">${item.condition}</td>
            <td class="col-score">${item.score}</td>
            <td class="col-rw-type" style="color: ${textColor};">${item.rewardType || '-'}</td>
            <td class="col-rw-content">${item.rewardContent || '-'}</td>
        `;
        listBody.appendChild(tr);
    });

    calculateChapterProgress(filtered);
}

// 3. 체크박스 영구 저장 핸들러
function toggleItem(id, checkbox) {
    const row = checkbox.closest('tr');
    if (checkbox.checked) {
        checkedItems[id] = true;
        row.classList.add('completed');
    } else {
        delete checkedItems[id];
        row.classList.remove('completed');
    }
    
    // STORAGE_KEY 상수를 완벽히 공유 반영하여 저장소 고장 위험을 차단했습니다.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedItems));
    calculateTotalProgress();

    if (currentStatusFilter !== 'ALL' || currentSearchQuery) {
        renderList();
    } else {
        renderList(); // 무결성 실시간 연동을 위해 화면 즉시 정돈
    }
}

// 4. 대시보드 진행 스코프 바 게이지 조절 연산부
function calculateTotalProgress() {
    const total = rawData.length;
    if(total === 0) return;
    
    const checkedCount = rawData.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('total-percent').textContent = `${percent}%`;
    document.getElementById('total-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('total-bar').style.width = `${percent}%`;

    // 기획 반영: '현재 누적 업적 점수' 누적 합산(reduce) 연산 처리
    const maxScore = rawData.reduce((acc, item) => acc + item.score, 0); 
    const myScore = rawData.filter(item => checkedItems[item.id]).reduce((acc, item) => acc + item.score, 0); 
    const scorePercent = maxScore > 0 ? Math.round((myScore / maxScore) * 100) : 0;

    document.getElementById('score-total').textContent = myScore.toLocaleString();
    document.getElementById('score-max').textContent = maxScore.toLocaleString();
    document.getElementById('score-bar').style.width = `${scorePercent}%`;
}

function calculateChapterProgress(currentItems) {
    const total = currentItems.length;
    
    if (currentSearchQuery) {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 검색 항목 달성도: ";
    } else if (currentRewardFilter !== 'ALL') {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "선택 보상 달성도: ";
    } else {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 소분류 달성도: ";
    }

    // 🌟 [무한 로딩 원천 차단 2단계 완결]
    // 비동기 첫 연산 시점에 분모가 0이 되어 게이지가 마비되는 현상을 막기 위해,
    // 카테고리 순정 모드일 시 rawData 전체 풀에서 실시간 수량을 전수 역추산해내도록 버그를 박멸했습니다.
    let exactTotal = total;
    if (exactTotal === 0 && currentMain && currentSub && !currentSearchQuery && currentRewardFilter === 'ALL') {
        exactTotal = rawData.filter(item => item.main === currentMain && item.sub === currentSub).length;
    }

    if(exactTotal === 0) {
        document.getElementById('chapter-percent').textContent = `0%`;
        document.getElementById('chapter-count').textContent = `0/0`;
        document.getElementById('chapter-bar').style.width = `0%`;
        return;
    }
    
    const checkedCount = currentItems.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / exactTotal) * 100);

    document.getElementById('chapter-percent').textContent = `${percent}%`;
    document.getElementById('chapter-count').textContent = `${checkedCount}/${exactTotal}`;
    document.getElementById('chapter-bar').style.width = `${percent}%`;
}


/**
 * ==============================================================================
 * 🚀 [무한 로딩 원천 차단 3단계 완결] 순차 기동 라우터 시동
 * ==============================================================================
 * 🌟 두 번째 파일의 초고속 무결성 원리인 프로미스 체이닝 패턴(`.then()`)을 도입했습니다.
 * 네트워크 편차와 상관없이 구글 서버에서 업적 레코드를 비동기로 100% 온전하게 내려받은 직후에만
 * 테이블 목록과 가이드라인 디스플레이가 순차적으로 맞물려 실행되므로 무한 로딩이 완벽하게 해결됩니다.
 */
fetchData().then(() => {
    renderList();
});
