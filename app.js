// app.js - Part 1
const GOOGLE_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwNb8IjqEgioNPBaCCQiGtd7pKEfMpNr6uOrj2j3WOXq6--DhNQyThpYLCy3uJuUYvd/exec';
const SHEET_URL = GOOGLE_WEB_APP_URL; 

let rawData = [];
let checkedItems = JSON.parse(localStorage.getItem('ff14_achievements_v2')) || {};

let currentMain = '';
let currentSub = '';
let currentRewardFilter = 'ALL'; 
let currentStatusFilter = 'ALL'; 
let currentSearchQuery = ''; 

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
                main: getVal(0),        // A열: 대분류
                sub: getVal(1),         // B열: 소분류
                name: achievementName,  // C열: 업적명
                condition: getVal(3),   // D열: 조건
                score: parsedScore,     // E열: 점수
                rewardType: getVal(5),  // F열: 보상 종류
                rewardContent: getVal(6)// G열: 보상 내용
            };
        }).filter(item => item.name && item.main); 

        initMenu();
        initRewardMenu(); 
        calculateTotalProgress();
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
    currentSearchQuery = inputElement.value.trim().toLowerCase();
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
// app.js - Part 2

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

// 🌟 [수정] 필터링 조건에 따른 동적 분류 열 숨김 및 활성화 로직 적용
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

    // 🌟 [핵심 변경] 보상 필터 작동 상태이거나 검색 기능 사용 중일 때만 분류 머리글 표시
    const showPathColumn = (currentRewardFilter !== 'ALL' || currentSearchQuery !== '');
    if (showPathColumn) {
        thPath.style.display = ''; // 켜기
    } else {
        thPath.style.display = 'none'; // 끄기
    }

    // 데이터 미존재 예외 처리 시 colspan 개수 동적 대응
    const activeColspan = showPathColumn ? 8 : 7;

    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="${activeColspan}" style="text-align: center; padding: 40px; color: #888;">필터 및 검색 조건에 부합하는 업적이 없습니다.</td></tr>`;
        calculateChapterProgress([]);
        return;
    }

    filtered.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isChecked = checkedItems[item.id] ? 'checked' : '';
        if(isChecked) tr.classList.add('completed');

        const textColor = getRewardColor(item.rewardType);

        // 🌟 [핵심 변경] 분류 열 활성화 조건에 따라 테이블 데이터 행(td) 분기 출력
        let pathTd = showPathColumn ? `<td class="col-path">${item.main} ＞ ${item.sub}</td>` : '';

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
