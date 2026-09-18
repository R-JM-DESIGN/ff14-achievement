// app.js - Part 1
// 🌟 [원상복구] 깃허브 캐시 대신 사용자님의 구글 웹앱 주소로 직접 데이터를 실시간 요청합니다.
// [설정] 구글 배포 서버로부터 JSON 형태의 업적 데이터를 원격 수집하는 게이트웨이 주소 상수입니다.
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbz-kQGaE1a_3qFcc8jD3ZytF-m-a_63-__i9scW7LQFRQ9CW8cpXMDwoJwzwS_3PU_x/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

// 🎯 [오류 영구 파쇄 완결] 로컬 스토리지 데이터 무결성을 보장하는 전역 공통 이름표 상수입니다.
const STORAGE_KEY = 'ff14_achievements_v2';

// [순정 구조 보존] 구글 시트 레코드와 로컬스토리지 완료 키 데이터를 메모리에 매핑합니다.
let rawData = [];
let checkedItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; 

// [상태 제어 스코프] 다중 교차 필터링 및 라이브 연산에 연동되는 실시간 전역 상태 인덱스입니다.
let currentMain = '';            // 대분류 카테고리 기록용 변수
let currentSub = '';             // 소분류 카테고리 기록용 변수
let currentRewardFilters = [];   // 보상 아이템 다중 토글 누적 저장용 배열 변수
let currentStatusFilter = 'ALL'; // 달성 상태 필터 기록용 변수 (ALL / 미완료 / 완료)
let currentSearchQuery = '';     // 통합 검색 키워드 실시간 소문자 저장용 변수

// [브라우저 돔 리스너] 마크업 스캔 완료 타이밍에 영구 저장된 테마를 호출합니다.
document.addEventListener("DOMContentLoaded", () => {
    applySavedThemeMode();
});

/**
 * ------------------------------------------------------------------------------
 * 1. 테마 모드 영구 기억 및 실시간 전환 엔진 (applySavedThemeMode, toggleThemeMode)
 * ------------------------------------------------------------------------------
 */
function applySavedThemeMode() {
    const savedTheme = localStorage.getItem("ff14_theme_mode") || "dark";
    const body = document.body;
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");

    if (!icon || !text) return;

    if (savedTheme === "light") {
        body.classList.add("light-mode"); 
        icon.textContent = "☀️";          
        text.textContent = "라이트 모드";   
    } else {
        body.classList.remove("light-mode"); 
        icon.textContent = "🌙";
        text.textContent = "다크 모드";
    }
}

function toggleThemeMode() {
    const body = document.body;
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");

    if (!icon || !text) return;

    if (body.classList.contains("light-mode")) {
        body.classList.remove("light-mode");
        icon.textContent = "🌙";
        text.textContent = "다크 모드";
        localStorage.setItem("ff14_theme_mode", "dark"); 
    } else {
        body.classList.add("light-mode");
        icon.textContent = "☀️";
        text.textContent = "라이트 모드";
        localStorage.setItem("ff14_theme_mode", "light"); 
    }
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
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`구글 웹 앱 응답 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("시트 내부에 파싱할 데이터 행이 부족합니다.");

        rawData = rows.slice(1).map((row) => {
            const getVal = (colIdx) => {
                return row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '';
            };

            const achievementName = getVal(2); 
            const parsedScore = parseInt(getVal(4).replace(/[^0-9]/g, '')) || 0;

            return {
                id: achievementName,    
                main: getVal(0),        
                sub: getVal(1),         
                name: achievementName,  
                condition: getVal(3),   // D열: 획득 방법 본문 저장
                score: parsedScore,     
                rewardType: getVal(5),  
                rewardContent: getVal(6)
            };
        }).filter(item => item.name && item.main); 

        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
        applySavedThemeMode(); 
    } catch (error) {
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
function handleSearchInput() {
    const inputElement = document.getElementById('search-keyword');
    if (inputElement) {
        currentSearchQuery = inputElement.value.trim().toLowerCase();
        renderList(); 
    }
}

function clearSearch() {
    const inputElement = document.getElementById('search-keyword');
    if (inputElement) {
        inputElement.value = ''; 
    }
    currentSearchQuery = ''; 
    updatePathDisplay(); 
    renderList(); 
}

function selectStatusFilter(status) {
    currentStatusFilter = status;
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    if(status === 'ALL') document.getElementById('status-all').classList.add('active');
    if(status === 'UNCOMPLETED') document.getElementById('status-uncompleted').classList.add('active');
    if(status === 'COMPLETED') document.getElementById('status-completed').classList.add('active');
    renderList();
}
/**
 * ------------------------------------------------------------------------------
 * 3. 중복 없는 데이터 기반 카테고리 대분류 버튼 생성기 (initMenu)
 * ------------------------------------------------------------------------------
 */
function initMenu() {
    const mains = [...new Set(rawData.map(item => item.main))];
    const mainGroup = document.getElementById('main-category-group');
    mainGroup.innerHTML = ''; 

    mains.forEach((main, idx) => {
        if(!main) return;
        const btn = document.createElement('button');
        btn.textContent = main;
        btn.onclick = () => selectMainCategory(main, btn); 
        mainGroup.appendChild(btn);
    });
}

// app.js - Part 2
// 순정 구분선 주석 동질 유지

function selectMainCategory(main, btn) {
    currentMain = main;
    currentRewardFilters = []; 
    updateRewardFilterUI();

    document.querySelectorAll('#main-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const subs = [...new Set(rawData.filter(item => item.main === main).map(item => item.sub))];
    const subGroup = document.getElementById('sub-category-group');
    subGroup.innerHTML = ''; 

    subs.forEach((sub, idx) => {
        if(!sub) return;
        const sBtn = document.createElement('button');
        sBtn.textContent = sub;
        sBtn.onclick = () => selectSubCategory(sub, sBtn); 
        subGroup.appendChild(sBtn);
    });
}

function selectSubCategory(sub, btn) {
    currentSub = sub;
    currentRewardFilters = []; 
    updateRewardFilterUI();
    
    document.querySelectorAll('#sub-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    updatePathDisplay(); 
    renderList();        
}

function initRewardMenu() {
    const rewardTypes = [...new Set(rawData.map(item => item.rewardType))].filter(t => t && t !== '-');
    const rewardGroup = document.getElementById('reward-category-group');
    rewardGroup.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.textContent = '필터 해제'; 
    allBtn.classList.add('reward-filter-btn', 'active');
    allBtn.id = 'rw-btn-all';
    allBtn.onclick = () => selectRewardMultiFilter('ALL');
    rewardGroup.appendChild(allBtn);

    rewardTypes.forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = type; 
        btn.classList.add('reward-filter-btn');
        btn.setAttribute('data-reward-type', type); 
        btn.onclick = () => selectRewardMultiFilter(type); 
        rewardGroup.appendChild(btn);
    });
}

function selectRewardMultiFilter(type) {
    if (type === 'ALL') {
        currentRewardFilters = []; 
    } else {
        const index = currentRewardFilters.indexOf(type);
        if (index > -1) {
            currentRewardFilters.splice(index, 1); 
        } else {
            currentRewardFilters.push(type); 
            document.querySelectorAll('#main-category-group button, #sub-category-group button').forEach(b => b.classList.remove('active'));
        }
    }
    
    updateRewardFilterUI(); 
    updatePathDisplay();    
    renderList();           
}

function updateRewardFilterUI() {
    const allBtn = document.getElementById('rw-btn-all');
    
    if (currentRewardFilters.length === 0) {
        document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
        if (allBtn) allBtn.classList.add('active'); 
    } else {
        if (allBtn) allBtn.classList.remove('active'); 
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

function renderList() {
    const listBody = document.getElementById('achievement-list');
    const thPath = document.getElementById('th-path');
    if (!listBody || !thPath) return;
    listBody.innerHTML = ''; 

    let filtered = [];
    
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

    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  
    }

    const showPathColumn = (currentRewardFilters.length > 0 || currentSearchQuery !== '');
    if (showPathColumn) thPath.style.display = ''; 
    else thPath.style.display = 'none'; 

    const activeColspan = showPathColumn ? 8 : 7;

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="${activeColspan}" style="text-align: center; padding: 40px; color: var(--text-color); opacity: 0.6;">필터 및 검색 조건에 부합하는 업적이 없습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed'); 

        const textColor = getRewardColor(item.rewardType);
        let pathTd = showPathColumn ? `<td class="col-path">${item.main}＞${item.sub}</td>` : '';

        // 🌟 [대괄호 탐색 기반 엔터 개행 및 폰트 축소 인젝션 알고리즘]
        let formattedWay = item.condition || '-';
        if (formattedWay.includes('[')) {
            const bracketIndex = formattedWay.indexOf('[');
            const frontText = formattedWay.substring(0, bracketIndex).trim(); // 대괄호 앞 원본 본문
            const bracketText = formattedWay.substring(bracketIndex).trim();  // 대괄호를 포함한 뒷부분 전부
            
            // 대괄호 앞에서 강제 엔터(<br>)를 치고, 뒷부분 글자 크기를 은은하게 0.83em으로 낮춘 레이아웃 결합
            formattedWay = `${frontText}<br><span style="display: block; font-size: 0.83em; color: var(--text-muted); font-weight: normal; margin-top: 3px;">${bracketText}</span>`;
        }

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            ${pathTd}
            <td class="col-name">${item.name}</td>
            <td class="col-way">${formattedWay}</td> 
            <td class="col-score">${item.score}</td>
            <td class="col-rw-type" style="color: ${textColor}; font-weight:bold;">${item.rewardType || '-'}</td>
            <td class="col-rw-content">${item.rewardContent || '-'}</td>
        `;
        listBody.appendChild(tr);
    });

    if (currentSearchQuery || currentRewardFilters.length > 0) {
        calculateChapterProgress(filtered);
    } else {
        const currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        calculateChapterProgress(currentViewItems);
    }
}

function toggleItem(id, checkbox) {
    const row = checkbox.closest('tr');
    if (checkbox.checked) {
        checkedItems[id] = true;
        row.classList.add('completed');
    } else {
        delete checkedItems[id];
        row.classList.remove('completed');
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedItems)); 
    calculateTotalProgress();

    if (currentStatusFilter !== 'ALL' || currentSearchQuery || currentRewardFilters.length > 0) {
        renderList();
    } else {
        const currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        calculateChapterProgress(currentViewItems);
    }
}

// 전체 달성 수치 대시보드 누적 계산
function calculateTotalProgress() {
    const total = rawData.length;
    if(total === 0) return;
    
    const checkedCount = rawData.filter(item => checkedItems[item.id]).length;
    const percent = Math.round((checkedCount / total) * 100);

    document.getElementById('total-percent').textContent = `${percent}%`;
    document.getElementById('total-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('total-bar').style.width = `${percent}%`;

    const myScore = rawData.filter(item => checkedItems[item.id]).reduce((acc, item) => acc + item.score, 0);
    document.getElementById('score-total').textContent = `${myScore.toLocaleString()} 점`;
}

function calculateChapterProgress(currentItems) {
    const total = currentItems.length;
    
    if (currentSearchQuery) document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 검색 항목 달성도: ";
    else if (currentRewardFilters.length > 0) document.getElementById('chapter-percent').parentElement.firstChild.textContent = "선택 보상 달성도: ";
    else document.getElementById('chapter-percent').parentElement.firstChild.textContent = "현재 소분류 달성도: ";

    let exactTotal = total;
    if (exactTotal === 0 && currentMain && currentSub && !currentSearchQuery && currentRewardFilters.length === 0) {
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

document.addEventListener('DOMContentLoaded', () => {
    fetchData().then(() => {
        updatePathDisplay(); 

        const mainButtons = document.querySelectorAll('#main-category-group button');
        const targetMainBtn = Array.from(mainButtons).find(btn => btn.textContent.trim() === '전투');

        if (targetMainBtn) {
            targetMainBtn.click(); 

            const subButtons = document.querySelectorAll('#sub-category-group button');
            const targetSubBtn = Array.from(subButtons).find(btn => btn.textContent.trim() === '일반');

            if (targetSubBtn) {
                targetSubBtn.click(); 
            } else {
                if (subButtons.length > 0) subButtons[0].click();
            }
        } else {
            const firstMainBtn = document.querySelector('#main-category-group button');
            if (firstMainBtn) firstMainBtn.click();
        }
    });
});
