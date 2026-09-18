/**
 * =========================================================================
 * 📋 app.js - Part 1 (코어 데이터 인프라 구축 및 시트 레코드 원격 수집부)
 * =========================================================================
 * 
 * [역할 및 시스템 개요]
 * 본 프로그램은 구글 스프레드시트의 웹 앱 API 주소로부터 실시간 원격 데이터를 안전하게 인출하고,
 * 컴퓨터가 실시간으로 연산하기 가장 좋은 객체(Object) 배열의 형태로 정밀 매핑 파싱을 수행합니다.
 * 더불어 브라우저의 로컬 스토리지와 연동하여 사용자의 체크박스 달성 상태의 영구 보존을 총괄합니다.
 */

// 1. 구글 스프레드시트 비동기 호출용 원격 웹 앱 API 주소 세팅 고정
// [설정] 구글 배포 서버와 브라우저 사이의 CORS 보안을 우회하여 JSON 데이터를 송수신하는 게이트웨이 주소입니다.
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwNb8IjqEgioNPBaCCQiGtd7pKEfMpNr6uOrj2j3WOXq6--DhNQyThpYLCy3uJuUYvd/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

// 2. 가동에 필요한 전역 변수(인스턴스 상태 저장소) 그룹 개설
// [메모리] 구글 시트에서 긁어온 순수 날것의 데이터 행들을 브라우저 메모리에 전체 보존하는 동적 배열입니다.
let rawData = []; 

// 3. 브라우저 로컬 스토리지에 도감 체크 내역을 심어둘 영구 저장소 고유 키 명칭
// [유지보수 고정 상수의 중심축] 향후 대규모 패치로 데이터 포맷을 변경할 때 이 키 이름만 수정하면 전체 저장소가 동기화됩니다.
const STORAGE_KEY = 'ff14_achievements_v2';

// 4. 로컬 스토리지로부터 사용자가 이전에 저장해 둔 체크박스 내역 객체를 불러오며, 없을 시 빈 상자({})로 시작
// [영구 기억 브릿지] 사용자가 새로고침을 하거나 브라우저를 껐다 켜도 기존의 체크 기록이 날아가지 않도록 보존합니다.
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

// 5. 활성화되어 가동 중인 다중 복합 필터들의 기본값 정의 스코프
// [상태 관리 인덱스] 유저가 화면에서 버튼을 클릭하거나 타이핑할 때 변경되는 필터의 기준 상태값들입니다.
let currentMain = '';            // A열 기준: 카테고리 필터링 타겟 (예: 배틀, 캐릭터 등 대분류)
let currentSub = '';             // B열 기준: 하위 서브 카테고리 필터링 타겟 (예: 던전, 토벌전 등 소분류)
let currentRewardFilter = 'ALL'; // F열 기준: 특정 아이템 보상 종류 필터링 타겟 (ALL / 탈것 / 칭호 등)
let currentStatusFilter = 'ALL'; // 체크박스 상태 기준: 완료 여부 필터 타겟 (ALL / 미완료 업적 / 완료한 업적)
let currentSearchQuery = '';     // 검색창 입력 기준: 통합 검색창에 입력된 실시간 키워드 보존용 변수


/**
 * ------------------------------------------------------------------------------
 * 6. 데이터 원격 로드 및 객체 직렬화 엔진 (fetchData)
 * ------------------------------------------------------------------------------
 * 구글 서버로부터 데이터를 비동기(Async-Await)로 초고속 수집한 뒤,
 * 시트 가로 행(Row) 데이터를 명확한 명칭을 가진 데이터 딕셔너리 구조로 안전하게 매핑합니다.
 */
async function fetchData() {
    try {
        // [비동기 네트워크 요청] 지정된 구글 웹 앱 URL 주소로 통신을 시도합니다.
        const res = await fetch(SHEET_URL);
        
        // [예외 차단 시스템] 통신 상태가 비정상(404, 500 에러 등)일 경우 즉시 구동을 중단하고 캐치 문으로 던집니다.
        if (!res.ok) throw new Error(`구글 웹 앱 응답 오류 (상태코드: ${res.status})`);
        
        // [JSON 포맷 해제] 받아온 문자열 스트링 데이터를 자바스크립트가 읽을 수 있는 배열 구조로 변환합니다.
        const rows = await res.json();
        
        // [데이터 검증] 데이터가 아예 비어있거나 헤더만 존재할 경우 예외 처리를 실행합니다.
        if (!rows || rows.length <= 1) throw new Error("시트 내부에 파싱할 데이터 행이 부족합니다.");

        // [초고속 데이터 매핑 알고리즘] 시트의 첫 번째 줄(타이틀 헤더)을 제외하고 나머지 줄을 객체 형태로 가공합니다.
        rawData = rows.slice(1).map((row) => {
            
            // 데이터 안전 가드레일: 특정 셀이 비어있거나 Null 일 때 오류가 나지 않도록 빈 문자열로 정제하는 함수입니다.
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            const achievementName = getVal(2); // C열: 업적 이름 추출
            const parsedScore = parseInt(getVal(4).replace(/[^0-9]/g, '')) || 0; // E열: 숫자 외 텍스트를 제거하고 정수로 강제 변환

            // [구조 정형화] 순서 기반의 행 배열을 Key-Value 형태의 가독성 높은 직관적인 객체 구조로 리턴합니다.
            return {
                id: achievementName,    // 기획 보정 반영: 업적명을 고유 ID 키로 삼아 데이터 순서 밀림을 완벽 방지
                main: getVal(0),        // A열: 대분류 데이터 저장
                sub: getVal(1),         // B열: 소분류 데이터 저장
                name: achievementName,  // C열: 업적명 데이터 저장
                condition: getVal(3),   // D열: 조건 데이터 저장
                score: parsedScore,     // E열: 정수로 가공된 업적 점수 저장
                rewardType: getVal(5),  // F열: 보상 종류 데이터 저장
                rewardContent: getVal(6)// G열: 보상 내용 데이터 저장
            };
        }).filter(item => item.name && item.main); // [데이터 다이어트] 필수 식별 데이터가 없는 불완전한 빈 행을 사전에 걸러냅니다.

        // [애플리케이션 UI 구동 연쇄 반응] 데이터 세팅이 성공하면 메뉴를 그리고 초기 대시보드를 연산합니다.
        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
    } catch (error) {
        // [휴먼 에러 리포팅 디스플레이] 데이터 로딩 실패 시 사용자가 인지할 수 있도록 에러 화면을 브라우저 중앙에 강제 렌더링합니다.
        console.error("데이터 로드 중 치명적 오류 발생:", error);
        document.getElementById('achievement-list').innerHTML = `
            <tr><td colspan="7" style="text-align: center; color: #ff4d4d; font-weight: bold; padding: 40px;">
                최신 업적 스프레드시트 데이터를 로드하지 못했습니다.<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">원인: ${error.message}</span>
            </td></tr>`;
    }
}
/**
 * =========================================================================
 * 📋 app.js - Part 3 (복합 조건 필터 가공 연산 및 실시간 렌더링·계측 엔진 부)
 * =========================================================================
 */

/**
 * ------------------------------------------------------------------------------
 * 1. 복합 필터 교차 결합 연산 및 HTML 테이블 최종 출력 엔진 (renderList)
 * ------------------------------------------------------------------------------
 * 검색창, 카테고리, 달성 상태, 보상 필터를 올인원으로 교차 분석하여 정밀 필터링합니다.
 */
function renderList() {
    const listBody = document.getElementById('achievement-list');
    listBody.innerHTML = ''; // 리렌더링 도중 잔상이 남지 않도록 도화지를 깨끗하게 지웁니다.

    let filtered = []; // 모든 예선 필터를 통과한 정예 업적 객체들을 가두어둘 임시 배열
    
    // 🔍 [1단계 필터링 스코프] 검색어 입력 유무에 따른 카테고리 연산 분기
    if (!currentSearchQuery) {
        // 검색창이 깨끗할 때는 카테고리 및 보상 탭의 기준을 표준 적용합니다.
        if (currentRewardFilter === 'ALL') {
            // 표준 모드: 현재 선택된 대분류와 소분류가 모두 일치하는 행들만 추출
            filtered = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        } else {
            // 보상 모아보기 모드: 대/소분류 소속 관계를 파괴하고 해당 한글 보상 종류를 가진 행만 통과
            filtered = rawData.filter(item => item.rewardType === currentRewardFilter);
        }
    } else {
        // [통합 검색창 모드] 기획서 내용 반영: 대/소분류 장벽을 완전히 허물고 전체 레코드 중 키워드가 걸리는 행을 전수 조사합니다.
        filtered = rawData.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(currentSearchQuery);       // 업적명 대조
            const condMatch = item.condition.toLowerCase().includes(currentSearchQuery);  // 조건 서식 대조
            const typeMatch = item.rewardType.toLowerCase().includes(currentSearchQuery);  // 보상종류 대조
            const rewardMatch = item.rewardContent.toLowerCase().includes(currentSearchQuery); // 보상내용 대조
            return nameMatch || condMatch || typeMatch || rewardMatch; // 4가지 공간 중 단 한 곳이라도 단어가 묻어있으면 합격
        });
        
        // 검색 전용 타이틀 안내 가이드라인으로 교체하고 발견된 실시간 데이터 건수를 매핑 출력합니다.
        document.getElementById('current-path-display').textContent = `🔍 전체 항목 중에서 '${currentSearchQuery}' 검색 결과 (총 ${filtered.length}건)`;
    }

    // 📋 [2단계 필터링 스코프] 유저가 체크해 둔 브라우저 보유 정보 데이터 객체 기반 완료/미완료 필터링
    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); // 완료 저장소 내부에 내 고유 아이디가 없는 것(미완료)만 잔류
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  // 완료 저장소 내부에 존재가 확인되는 행들만 잔류
    }

    // 🚨 [데이터 부재 예외 처리] 필터 연산 종료 후 단 한 건의 업적도 통과하지 못한 상황의 시각 디자인 예외 출력
    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #888;">필터 및 검색 조건에 부합하는 업적이 없습니다.</td></tr>`;
        calculateChapterProgress([]); // 서브 진행바 레이아웃 역시 0%로 강제 초기화
        return;
    }

    // 🛠️ [3단계 물리 렌더링] 최종 통과한 데이터를 바탕으로 화면에 테이블 로우 HTML 태그 스트링 조립 적재
    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        
        // 사용자가 과거에 체크해서 로컬스토리지에 박혀있는 아이템인 경우, 체크 활성화 문자열 가동
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        
        // [기획 요구 반영] 체크 완료된 열인 경우 행 자체를 흐려지게 만들 CSS 완료 클래스('completed') 실시간 전개
        if(isChecked) tr.classList.add('completed');

        // 파트2에서 정의된 보상 고유 명도 컬러 코드 수신
        const textColor = getRewardColor(item.rewardType);

        // [기획서 레이아웃 규격서 반영 하드코딩 주입] 
        // 순번 쪼개짐 여백 제어, 조건 본문 글자 크기 축소 서식(0.85em)을 CSS 클래스로 안전하게 배포 주입합니다.
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

    // 렌더링 빌드가 끝나면 현재 유저가 보고 있는 좁은 화면 영역 단위의 전용 진행 수치 계측 알고리즘을 연동합니다.
    calculateChapterProgress(filtered);
}


/**
 * ------------------------------------------------------------------------------
 * 2. 체크박스 클릭 핸들러 및 데이터 세이브 실시간 저장소 브릿지 (toggleItem)
 * ------------------------------------------------------------------------------
 * 유저가 화면에서 업적 완수 체크박스를 딸깍 누르는 타이밍에 물리적으로 트리거됩니다.
 */
function toggleItem(id, checkbox) {
    const row = checkbox.closest('tr'); // 클릭 이벤트를 일으킨 체크박스가 포함된 상위 행 <tr> 노드를 역추적합니다.
    
    if (checkbox.checked) {
        checkedItems[id] = true; // 체크 활성화 시 자바스크립트 전역 완수 딕셔너리에 업적명을 키 값으로 데이터 추가
        row.classList.add('completed'); // 즉시 실시간으로 행에 줄을 긋고 투명도를 낮추는 클래스 부여
    } else {
        delete checkedItems[id]; // 체크 해제 시 자바스크립트 내 메모리 공간에서 해당 업적 데이터 파괴 제거
        row.classList.remove('completed');
    }
    
    // 🎯 [STORAGE_KEY 상수 결합 수선 반영] 
    // 브라우저 샌드박스 내부의 로컬 스토리지 공간에 자바스크립트 객체를 압축(JSON.stringify)하여 영구 박제 저장합니다.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedItems));
    
    // 메인 대시보드 누적 수치 연산부 동기화 호출
    calculateTotalProgress();

    // 유저가 '미완료만 보기' 등의 필터를 켠 상태이거나 검색창을 이용 중일 때 체크 해제/체크 시 리스트가 실시간 갱신(소멸)되도록 제어
    if (currentStatusFilter !== 'ALL' || currentSearchQuery) {
        renderList();
    } else {
        // 단순 일반 카테고리 모드에서는 전체 리스트를 새로 그리는 낭비 없이 서브 게이지 바만 부드럽게 재계산 처리합니다.
        let currentViewItems = [];
        if (currentRewardFilter === 'ALL') {
            currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        } else {
            currentViewItems = rawData.filter(item => item.rewardType === currentRewardFilter);
        }
        calculateChapterProgress(currentViewItems);
    }
}


/**
 * ------------------------------------------------------------------------------
 * 3. 대시보드 진척도 백분율 실시간 연산 시스템 (calculateTotalProgress, calculateChapterProgress)
 * ------------------------------------------------------------------------------
 * 전체 누적 성적 및 로컬 스코프 영역의 진행 바의 그래픽 너비 속성을 제어합니다.
 */
// 3-1. 메인 통합 전역 누적 점수 및 완료 업적 대시보드 계측
function calculateTotalProgress() {
    const total = rawData.length;
    if(total === 0) return;
    
    // 전체 업적 배열 중 내 완료 목록 객체에 등록이 확인된 레코드 개수 필터 카운팅
    const checkedCount = rawData.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100); // 정수형 백분율 변환

    // 최상단 메인 대시보드 수치 텍스트 매핑 및 프로그레스 바 그래픽 너비(CSS Width %) 조절
    document.getElementById('total-percent').textContent = `${percent}%`;
    document.getElementById('total-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('total-bar').style.width = `${percent}%`;

    // 🎯 [기획서 보정 요구 전면 반영] '현재 누적 업적 점수' 연산 엔진 작동
    // 가공되지 않은 순수 스코어 점수의 총합을 축적 연산(reduce)합니다.
    const maxScore = rawData.reduce((acc, item) => acc + item.score, 0); 
    // 내가 완료한 업적 점수만 한데 모아 누적 합산합니다.
    const myScore = rawData.filter(item => checkedItems[item.id]).reduce((acc, item) => acc + item.score, 0); 
    const scorePercent = maxScore > 0 ? Math.round((myScore / maxScore) * 100) : 0;

    // 세 자릿수 컴마 포맷팅(toLocaleString)을 처리하여 텍스트 출력 및 점수 바 조절 완료
    document.getElementById('score-total').textContent = myScore.toLocaleString();
    document.getElementById('score-max').textContent = maxScore.toLocaleString();
    document.getElementById('score-bar').style.width = `${scorePercent}%`;
}

// 3-2. 유저가 현재 위치한 영역(소분류/검색/보상 필터) 스코프 한정 로컬 진행바 계산
function calculateChapterProgress(currentItems) {
    const total = currentItems.length;
    
    // 유저가 검색창을 쓰느냐, 보상 필터를 켰느냐에 따라 프로그레스 바 앞단 타이틀 한글 가이드를 동적 스위칭합니다.
    if (currentSearchQuery) {
        document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 검색 항목 달성도: ";
    } else if (currentRewardFilter !== 'ALL') {
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

    // 하단 서브 프로그레스 바 UI 동적 갱신 완료
    document.getElementById('chapter-percent').textContent = `${percent}%`;
    document.getElementById('chapter-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('chapter-bar').style.width = `${percent}%`;
}


/**
 * ==============================================================================
 * 🚀 시스템 엔진 최상위 가동 커맨드 (엔트리 포인트)
 * ==============================================================================
 * 브라우저가 스크롤 마크업 로딩과 자바스크립트 코드의 스캔을 끝마친 순간,
 * 1부 원격 동기화 함수인 fetchData()를 작동시키며 어플리케이션의 문을 활짝 엽니다.
 */
fetchData();
