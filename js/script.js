(() => {
  const ROWS = 6;
  const MIN_LEN = 3;
  const MAX_LEN = 12;

  // DOM
  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const inputEl = document.getElementById("guess");
  const submitBtn = document.getElementById("submit");
  const resetBtn = document.getElementById("reset");
  const shareBtn = document.getElementById("share");
  const messageEl = document.getElementById("message");
  const shareTextEl = document.getElementById("shareText");

  // Modal
  const meaningModal = document.getElementById("meaningModal");
  const modalWordEl = document.getElementById("modalWord");
  const modalMeaningEl = document.getElementById("modalMeaning");
  const closeModalBtn = document.getElementById("closeModal");

  const must = (el, id) => { if(!el) throw new Error(`#${id} tidak ada`); return el; };
  [ ["board",boardEl],["keyboard",keyboardEl],["guess",inputEl],["submit",submitBtn],["reset",resetBtn],
    ["share",shareBtn],["message",messageEl],["shareText",shareTextEl],
    ["meaningModal",meaningModal],["modalWord",modalWordEl],["modalMeaning",modalMeaningEl],["closeModal",closeModalBtn]
  ].forEach(([id,el])=>must(el,id));

  // Keyboard layout
  const KEY_LAYOUT = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["ENTER","Z","X","C","V","B","N","M","⌫"]
  ];
  const RANK = { b:1, y:2, g:3 };

  // Data
  let wordsReady = false;
  let ANSWERS = [];            // [{word, meaning}]
  let answer = null;           // {word, meaning}
  let COLS = 5;                // dinamis

  // KBBI cache per length
  const kbbiCache = new Map(); // len -> Set
  let kbbiSet = new Set();     // current

  // State
  let cells = [];
  let keyButtons = new Map();
  let currentRow = 0;
  let currentCol = 0;
  let gameOver = false;
  let guesses = [];
  let colorHistory = [];

  // Utils
  const setMessage = (t)=>{ messageEl.textContent = t||""; };
  const normalize = (w)=> String(w||"").toUpperCase().replace(/[^A-Z]/g,"");
  const isLenOK = (w)=> w.length>=MIN_LEN && w.length<=MAX_LEN;
  const isAlpha = (ch)=> /^[A-Z]$/.test(ch);
  const clampGuess = (s)=> normalize(s).slice(0, COLS);
  const idx = (r,c)=> r*COLS + c;
  const rowWord = (r)=> guesses[r].join("");
  const rowComplete = (r)=> guesses[r].every(isAlpha);

  // Modal
  function openMeaningModal(word, meaning){
    modalWordEl.textContent = word;
    modalMeaningEl.textContent = meaning || "Makna belum tersedia.";
    meaningModal.classList.add("show");
    meaningModal.setAttribute("aria-hidden","false");
  }
  function closeMeaningModal(){
    meaningModal.classList.remove("show");
    meaningModal.setAttribute("aria-hidden","true");
  }
  closeModalBtn.addEventListener("click", closeMeaningModal);
  meaningModal.addEventListener("click", (e)=>{ if(e.target===meaningModal) closeMeaningModal(); });
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeMeaningModal(); });

  // Evaluate
  function evaluateGuess(guess, answerWord){
    const L = COLS;
    const result = Array(L).fill("b");
    const ans = answerWord.split("");
    const g = guess.split("");

    for(let i=0;i<L;i++){
      if(g[i]===ans[i]){
        result[i]="g";
        ans[i]=null;
      }
    }
    for(let i=0;i<L;i++){
      if(result[i]==="g") continue;
      const j = ans.indexOf(g[i]);
      if(j!==-1){
        result[i]="y";
        ans[j]=null;
      }
    }
    return result;
  }

  // Keyboard color
  function keyColor(btn){
    if(btn.classList.contains("g")) return "g";
    if(btn.classList.contains("y")) return "y";
    if(btn.classList.contains("b")) return "b";
    return null;
  }
  function updateKeyboard(word, colors){
    for(let i=0;i<COLS;i++){
      const letter = word[i];
      const color = colors[i];
      const btn = keyButtons.get(letter);
      if(!btn) continue;
      const existing = keyColor(btn);
      if(!existing || RANK[color] > RANK[existing]){
        btn.classList.remove("g","y","b");
        btn.classList.add(color);
      }
    }
  }

  // UI builders
  function buildBoard(){
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--cols", String(COLS));
    cells = [];
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const cell = document.createElement("div");
        cell.className="cell";
        boardEl.appendChild(cell);
        cells.push(cell);
      }
    }
  }
  function buildKeyboard(){
    keyboardEl.innerHTML = "";
    keyButtons.clear();
    KEY_LAYOUT.forEach(rowKeys=>{
      const row = document.createElement("div");
      row.className="krow";
      rowKeys.forEach(k=>{
        const btn = document.createElement("button");
        btn.type="button";
        btn.className="key";
        btn.textContent=k;
        if(k==="ENTER" || k==="⌫") btn.classList.add("wide");
        btn.addEventListener("click", ()=> onVirtualKey(k));
        row.appendChild(btn);
        if(/^[A-Z]$/.test(k)) keyButtons.set(k, btn);
      });
      keyboardEl.appendChild(row);
    });
  }
  function initGuesses(){
    guesses = Array.from({length: ROWS}, ()=> Array(COLS).fill(""));
    colorHistory = [];
    currentRow = 0;
    currentCol = 0;
    gameOver = false;
  }
  function renderActiveRow(){
    for(let c=0;c<COLS;c++){
      cells[idx(currentRow,c)].textContent = guesses[currentRow][c] || "";
    }
  }

  // Input
  function addLetter(ch){
    if(gameOver) return;
    if(currentCol>=COLS) return;
    guesses[currentRow][currentCol] = ch;
    cells[idx(currentRow,currentCol)].textContent = ch;
    currentCol++;
    inputEl.value = guesses[currentRow].join("");
  }
  function removeLetter(){
    if(gameOver) return;
    if(currentCol<=0) return;
    currentCol--;
    guesses[currentRow][currentCol] = "";
    cells[idx(currentRow,currentCol)].textContent = "";
    inputEl.value = guesses[currentRow].join("");
  }
  function onVirtualKey(k){
    setMessage("");
    if(k==="ENTER") return submitRow();
    if(k==="⌫") return removeLetter();
    addLetter(k);
  }

  // Share
  function buildShareText(final){
    const mapEmoji = { g:"🟩", y:"🟨", b:"⬜" };
    const tries = colorHistory.length;
    const score = final ? `${tries}/${ROWS}` : `${tries}/${ROWS} (sementara)`;
    let out = `KATGA K3 ${score}\n`;
    for(const row of colorHistory){
      out += row.map(x=>mapEmoji[x]||"⬜").join("") + "\n";
    }
    return out.trimEnd();
  }
  async function copyToClipboard(text){
    try{ await navigator.clipboard.writeText(text); return true; }
    catch(_){
      try{
        shareTextEl.value = text;
        shareTextEl.focus(); shareTextEl.select();
        document.execCommand("copy");
        return true;
      }catch(__){ return false; }
    }
  }
  async function onShare(){
    const text = buildShareText(true);
    shareTextEl.value = text;
    const ok = await copyToClipboard(text);
    setMessage(ok ? "✅ Hasil disalin!" : "❌ Gagal copy otomatis. Salin manual.");
  }

  // Load KBBI per length (JSON)
  async function loadKbbiForLength(len){
    if(kbbiCache.has(len)){
      kbbiSet = kbbiCache.get(len);
      return;
    }
    setMessage(`Memuat kamus (${len} huruf)...`);
    const res = await fetch(`/data/kbbi/${len}.json`, { cache:"no-store" });
    if(!res.ok) throw new Error(`File /data/kbbi/${len}.json tidak ada (${res.status})`);
    const data = await res.json();
    const list = Array.isArray(data.words) ? data.words : [];
    const set = new Set(list.map(normalize).filter(w=>w.length===len));
    kbbiCache.set(len, set);
    kbbiSet = set;
  }

  // Shuffle-bag answers (tidak mengulang sampai habis)
  const BAG_KEY = "katga_k3_answer_bag_len_3_12_v1";
  function shuffleArray(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }
  function refillBag(){
    const bag = shuffleArray(ANSWERS.map(a=>a.word).slice());
    localStorage.setItem(BAG_KEY, JSON.stringify(bag));
    return bag;
  }
  function pickNextAnswer(){
    let bag;
    try{ bag = JSON.parse(localStorage.getItem(BAG_KEY)||"[]"); }catch(_){ bag=[]; }
    if(!Array.isArray(bag) || bag.length===0) bag = refillBag();

    let nextWord = null;
    while(bag.length>0){
      const cand = bag.pop();
      if(cand && isLenOK(cand)){
        nextWord = cand;
        break;
      }
    }
    localStorage.setItem(BAG_KEY, JSON.stringify(bag));

    if(!nextWord){
      const fallback = ANSWERS.find(a=>isLenOK(a.word));
      if(!fallback) throw new Error("Tidak ada jawaban K3 dengan panjang 3–12.");
      nextWord = fallback.word;
    }
    answer = ANSWERS.find(a=>a.word===nextWord) || { word: nextWord, meaning:"" };
  }

  // Start round
  async function startRound(){
    pickNextAnswer();
    COLS = answer.word.length;
    if(!isLenOK(answer.word)) throw new Error("Jawaban di luar 3–12 huruf.");

    await loadKbbiForLength(COLS);

    // agar selalu bisa ditebak meski tidak ada di wordlist
    kbbiSet.add(answer.word);

    initGuesses();
    buildBoard();
    buildKeyboard();

    inputEl.maxLength = COLS;
    inputEl.placeholder = `Ketik ${COLS} huruf`;
    inputEl.value = "";

    submitBtn.disabled = false;
    inputEl.disabled = false;
    shareBtn.disabled = true;
    shareTextEl.value = "";
    closeMeaningModal();
    setMessage(`Mulai! Tebak kata (${COLS} huruf).`);
  }

  function isValidGuess(word){
    return kbbiSet.has(word);
  }

  // Submit
  function submitRow(){
    if(!wordsReady) return setMessage("Data belum siap.");
    if(gameOver) return;

    const clean = clampGuess(inputEl.value);
    guesses[currentRow] = Array(COLS).fill("");
    for(let i=0;i<clean.length;i++) guesses[currentRow][i] = clean[i];
    currentCol = clean.length;
    renderActiveRow();

    if(!rowComplete(currentRow)) return setMessage(`Ketik ${COLS} huruf dulu.`);
    const word = rowWord(currentRow);

    if(!isValidGuess(word)) return setMessage("Kata tidak ada di kamus untuk panjang ini.");

    const colors = evaluateGuess(word, answer.word);
    colorHistory.push(colors);

    for(let c=0;c<COLS;c++){
      const cell = cells[idx(currentRow,c)];
      cell.classList.remove("g","y","b");
      cell.classList.add(colors[c]);
    }
    updateKeyboard(word, colors);

    shareBtn.disabled = colorHistory.length === 0;
    shareTextEl.value = buildShareText(false);

    if(word === answer.word){
      setMessage("🎉 Benar! Kamu menang!");
      gameOver = true;
      submitBtn.disabled = true;
      inputEl.disabled = true;
      shareTextEl.value = buildShareText(true);
      openMeaningModal(answer.word, answer.meaning);
      return;
    }

    currentRow++;
    currentCol = 0;
    inputEl.value = "";

    if(currentRow >= ROWS){
      setMessage(`😅 Kesempatan habis. Jawabannya: ${answer.word}`);
      gameOver = true;
      submitBtn.disabled = true;
      inputEl.disabled = true;
      shareTextEl.value = buildShareText(true);
      return;
    }

    setMessage(`Sisa percobaan: ${ROWS-currentRow}`);
  }

  // Load answers
  async function loadAnswers(){
    setMessage("Memuat jawaban K3...");
    const res = await fetch("/data/k3-words.json", { cache:"no-store" });
    if(!res.ok) throw new Error(`Gagal load /data/k3-words.json (${res.status})`);
    const data = await res.json();
    const raw = Array.isArray(data.answers) ? data.answers : [];
    ANSWERS = raw.map(a=>({
      word: normalize(a.word),
      meaning: String(a.meaning||"")
    })).filter(a=>a.word.length>0);
    if(ANSWERS.length===0) throw new Error("answers kosong.");
    wordsReady = true;
  }

  // Events
  submitBtn.addEventListener("click", submitRow);
  resetBtn.addEventListener("click", ()=>startRound().catch(err=>{
    console.error(err);
    setMessage("❌ Reset gagal. Pastikan file data/kbbi/3..12.json ada.");
  }));
  shareBtn.addEventListener("click", onShare);

  document.addEventListener("keydown",(e)=>{
    if(gameOver) return;
    if(e.key==="Enter"){ e.preventDefault(); return submitRow(); }
    if(e.key==="Backspace"){ e.preventDefault(); return removeLetter(); }
    if(/^[a-zA-Z]$/.test(e.key)){ e.preventDefault(); return addLetter(e.key.toUpperCase()); }
  });

  inputEl.addEventListener("input", ()=>{
    if(gameOver) return;
    const clean = clampGuess(inputEl.value);
    guesses[currentRow] = Array(COLS).fill("");
    for(let i=0;i<clean.length;i++) guesses[currentRow][i]=clean[i];
    currentCol = clean.length;
    renderActiveRow();
  });

  // Init
  (async function init(){
    buildKeyboard();
    try{
      await loadAnswers();
      await startRound();
    }catch(err){
      console.error(err);
      setMessage("❌ Gagal memuat data. Pastikan file JSON lengkap ada di repo.");
    }
  })();

})();
