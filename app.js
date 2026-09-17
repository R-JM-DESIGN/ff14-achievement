// app.js - Part 1
const GOOGLE_WEB_APP_URL = 'https://google.com';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

let rawData = [];
let checkedItems = JSON.parse(localStorage.getItem('ff14_achievements_v2')) || {};

let currentMain = '';
let currentSub = '';
let currentRewardFilter = 'ALL'; 
let currentStatusFilter = 'ALL'; 
let currentSearchQuery = ''; 

// 🌟 [철벽 강화] 페이지가 켜질 때 브라우저에 저장된 테마 모드를 감지하고 무조건 즉시 동기화
document.addEventListener("DOMContentLoaded", () => {
    applySavedThemeMode();
});

function applySavedThemeMode() {
    const savedTheme = localStorage.getItem("ff14_theme_mode") || "dark";
    const body = document.body;
    const icon = document.getElementById("theme-icon");
    const text = document.getElementById("theme-text");

    if (!icon || !text) return; // 버튼 요소를 찾지 못하면 예외 안전 처리

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

// 🌟 [철벽 강화] index.html의 onclick="toggleThemeMode()" 명령을 강제로 낚아채 정밀 변환 수행
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
    
    // 테마가 바뀌면 하단 표의 보상 글자 명도 색상도 실시간 전면 리렌더링
    renderList();
}

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
                condition: getVal(3),   
                score: parsedScore,     
                rewardType: getVal(5),  
                rewardContent: getVal(6)
            };
        }).filter(item => item.name && item.main); 

        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
        applySavedThemeMode(); // 데이터 수신 완료 시점에 테마 한 번 더 검증 안착
    } catch (error) {
        console.error(error);
        document.getElementById('achievement-list').innerHTML = `
            <tr><td colspan="8" style="text-align: center; color: #ff4d4d; font-weight: bold; padding: 40px;">
                구글 스프레드시트 데이터를 로드하지 못했습니다.<br>
                <span style="color: #aaa; font-size: 0.9em; font-weight: normal;">이유: ${error.message}</span>
            </td></tr>`;
    }
}

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
    
    if (currentRewardFilter === 'ALL') {
        document.getElementById('current-path-display').textContent = `${currentMain} ＞ ${currentSub}`;
    } else {
        document.getElementById('current-path-display').textContent = `🎁 [필터] 종류 : ${currentRewardFilter}`;
    }
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
// app.js - Part 2

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
    currentRewardFilter = 'ALL'; 
    updateRewardFilterActive();

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
    currentRewardFilter = 'ALL';
    updateRewardFilterActive();
    
    document.querySelectorAll('#sub-category-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('current-path-display').textContent = `${currentMain} ＞ ${currentSub}`;
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

// 🌟 [라이트 대응 핵심 교정] 흰 배경(라이트 모드)에서도 보상 글자가 흐릿하게 묻히지 않도록 최적 명도 컬러 매핑
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
    listBody.innerHTML = '';

    let filtered = [];
    
    if (!currentSearchQuery) {
        if (currentRewardFilter === 'ALL') {
            filtered = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        } else {
            filtered = rawData.filter(item => item.rewardType === currentRewardFilter);
        }
    } else {
        filtered = rawData.filter(item => {
            const nameMatch = item.name.toLowerCase().includes(currentSearchQuery);
            const condMatch = item.condition.toLowerCase().includes(currentSearchQuery);
            const typeMatch = item.rewardType.toLowerCase().includes(currentSearchQuery);
            const rewardMatch = item.rewardContent.toLowerCase().includes(currentSearchQuery);
            return nameMatch || condMatch || typeMatch || rewardMatch;
        });
        
        document.getElementById('current-path-display').textContent = `🔍 전체 항목 중에서 '${currentSearchQuery}' 검색 결과 (총 ${filtered.length}건)`;
    }

    if (currentStatusFilter === 'UNCOMPLETED') {
        filtered = filtered.filter(item => !checkedItems[item.id]); 
    } else if (currentStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(item => checkedItems[item.id]);  
    }

    const showPathColumn = (currentRewardFilter !== 'ALL' || currentSearchQuery !== '');
    if (showPathColumn) {
        thPath.style.display = ''; 
    } else {
        thPath.style.display = 'none'; 
    }

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

    calculateChapterProgress(filtered);
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

    if (currentStatusFilter !== 'ALL' || currentSearchQuery) {
        renderList();
    } else {
        let currentViewItems = [];
        if (currentRewardFilter === 'ALL') {
            currentViewItems = rawData.filter(item => item.main === currentMain && item.sub === currentSub);
        } else {
            currentViewItems = rawData.filter(item => item.rewardType === currentRewardFilter);
        }
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

    document.getElementById('chapter-percent').textContent = `${percent}%`;
    document.getElementById('chapter-count').textContent = `${checkedCount}/${total}`;
    document.getElementById('chapter-bar').style.width = `${percent}%`;
}

fetchData();
