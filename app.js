// app.js - Part 1
const SHEET_URL = './data.json'; 

let rawData = [];
let checkedItems = JSON.parse(localStorage.getItem('ff14_achievements_v2')) || {};

let currentMain = '';
let currentSub = '';
let currentRewardFilters = []; 
let currentStatusFilter = 'ALL'; 
let currentSearchQuery = ''; 

// 🌟 [속도 혁명 핵심] 한 번에 다 그리지 않고 60개씩 나누어 초고속 로딩을 유도하는 가변 페이징 변수
let displayLimit = 60; 
let fullyFilteredItems = []; // 필터링이 완료된 최종 배열을 상시 임시 보관

document.addEventListener("DOMContentLoaded", () => {
    applySavedThemeMode();
    setupInfiniteScrollSensor(); // 🌟 스크롤 감지 센서 상시 가동
});

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

async function fetchData() {
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`데이터 로드 오류 (상태코드: ${res.status})`);
        
        const rows = await res.json();
        if (!rows || rows.length <= 1) throw new Error("파싱할 데이터 행이 부족합니다.");

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
                condition: getVal(3),   
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
                최적화 데이터 캐시 파일을 로드하지 못했습니다.<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">이유: 아직 깃허브 액션이 첫 data.json 자동 생성을 구동하기 전이거나, 파일이 누락되었습니다.</span>
            </td></tr>`;
    }
}
// app.js - Part 2

function handleSearchInput() {
    const inputElement = document.getElementById('search-keyword');
    if (inputElement) {
        currentSearchQuery = inputElement.value.trim().toLowerCase();
        displayLimit = 60; // 검색어가 바뀔 때마다 페이징 한계치 초기화
        renderList(); 
    }
}

function clearSearch() {
    const inputElement = document.getElementById('search-keyword');
    if (inputElement) {
        inputElement.value = ''; 
    }
    currentSearchQuery = ''; 
    displayLimit = 60;
    updatePathDisplay();
    renderList(); 
}

function selectStatusFilter(status) {
    currentStatusFilter = status;
    displayLimit = 60; // 필터 변경 시 초기화
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    if(status === 'ALL') document.getElementById('status-all').classList.add('active');
    if(status === 'UNCOMPLETED') document.getElementById('status-uncompleted').classList.add('active');
    if(status === 'COMPLETED') document.getElementById('status-completed').classList.add('active');
    renderList();
}

function initMenu() {
    const mains = [...new Set(rawData.map(item => item.main))];
    const mainGroup = document.getElementById('main-category-group');
    mainGroup.innerHTML = '';

    mains.forEach((main, idx) => {
        if(!main) return;
        const btn = document.createElement('button');
        btn.textContent = main;
        btn.onclick = () => selectMainCategory(main, btn);
        if(idx === 0) btn.click(); 
        mainGroup.appendChild(btn);
    });
}

function selectMainCategory(main, btn) {
    currentMain = main;
    currentRewardFilters = []; 
    displayLimit = 60;
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
        if(idx === 0) sBtn.click(); 
        subGroup.appendChild(sBtn);
    });
}

function selectSubCategory(sub, btn) {
    currentSub = sub;
    currentRewardFilters = []; 
    displayLimit = 60;
    updateRewardFilterUI();
    
    document.querySelectorAll('#sub-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    updatePathDisplay();
    renderList();
}
// app.js - Part 3

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
    
    displayLimit = 60; // 보상 다중 필터 선택 시 페이징 리셋
    updateRewardFilterUI();
    updatePathDisplay();
    renderList();
}

function updateRewardFilterUI() {
    const allBtn = document.getElementById('rw-btn-all');
    if (currentRewardFilters.length === 0) {
        document.querySelectorAll('.reward-filter-btn').forEach(b => b.classList.remove('active'));
        if (allBtn) allBtn.add('active');
    } else {
        if (allBtn) allBtn.remove('active');
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

// 🌟 [초고속 개조] 1만 개 배열 중에서 화면 한계 수치(displayLimit)만큼만 쪼개어 그리는 지능형 렌더러
function renderList() {
    const listBody = document.getElementById('achievement-list');
    const thPath = document.getElementById('th-path');
    if (!listBody || !thPath) return;
    listBody.innerHTML = '';

    fullyFilteredItems = [];
    
    if (!currentSearchQuery) {
        if (currentRewardFilters.length === 0) {
            fullyFilteredItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        } else {
            fullyFilteredItems = rawData.filter(item => currentRewardFilters.includes(item.rewardType));
        }
    } else {
        fullyFilteredItems = rawData.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(currentSearchQuery);
            const condMatch = item.condition.toLowerCase().includes(currentSearchQuery);
            const typeMatch = item.rewardType.toLowerCase().includes(currentSearchQuery);
            const rewardMatch = item.rewardContent.toLowerCase().includes(currentSearchQuery);
            return nameMatch || condMatch || typeMatch || rewardMatch;
        });
    }

    if (currentStatusFilter === 'UNCOMPLETED') {
        fullyFilteredItems = fullyFilteredItems.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        fullyFilteredItems = fullyFilteredItems.filter(item => checkedItems[item.id]);  
    }

    const showPathColumn = (currentRewardFilters.length > 0 || currentSearchQuery !== '');
    if (showPathColumn) {
        thPath.style.display = ''; 
    } else {
        thPath.style.display = 'none'; 
    }

    const activeColspan = showPathColumn ? 8 : 7;

    if (fullyFilteredItems.length === 0) {
        listBody.innerHTML = `<tr><td colspan="${activeColspan}" style="text-align: center; padding: 40px; color: var(--text-color); opacity: 0.6;">필터 및 검색 조건에 부합하는 업적이 없습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    // 🌟 1만 개 데이터가 있어도 처음엔 딱 displayLimit(60개)만 추출해서 0.01초 만에 화면 잠금 드로잉!
    const sliceItems = fullyFilteredItems.slice(0, displayLimit);

    sliceItems.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed');

        const textColor = getRewardColor(item.rewardType);
        let pathTd = showPathColumn ? `<td class="col-path">${item.main}＞${item.sub}</td>` : '';

        tr.innerHTML = `
            <td class="col-no">${idx + 1}</td> 
            <td class="col-check"><input type="checkbox" ${isChecked} onchange="toggleItem('${item.id}', this)"></td>
            ${pathTd}
            <td class="col-name">${item.name}</td>
            <td class="col-cond">${item.condition}</td>
            <td class="col-score">${item.score}</td>
            <td class="col-rw-type" style="color: ${textColor};">${item.rewardType || '-'}</td>
            <td class="col-rw-content">${item.rewardContent || '-'}</td>
        `;
        listBody.appendChild(tr);
    });

    if (currentSearchQuery || currentRewardFilters.length > 0) {
        calculateChapterProgress(fullyFilteredItems);
    } else {
        const currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        calculateChapterProgress(currentViewItems);
    }
}

// 🌟 [신규 강력 이식] 유저가 테이블 휠을 맨 아래로 내릴 때마다 백그라운드에서 다음 60개를 추가로 탑재하는 센서
function setupInfiniteScrollSensor() {
    window.addEventListener("scroll", () => {
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 150) {
            // 보일 수 있는 남은 목록이 더 존재한다면 실행
            if (displayLimit < fullyFilteredItems.length) {
                displayLimit += 60; // 한계 수치를 늘리고
                renderList(); // 화면 스크롤 끊김 없이 부드럽게 연장 추가
            }
        }
    });
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
    
    localStorage.setItem('ff14_achievements_v2', JSON.stringify(checkedItems));
    calculateTotalProgress();

    if (currentStatusFilter !== 'ALL' || currentSearchQuery || currentRewardFilters.length > 0) {
        renderList();
    } else {
        const currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        calculateChapterProgress(currentViewItems);
    }
}

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

fetchData();
