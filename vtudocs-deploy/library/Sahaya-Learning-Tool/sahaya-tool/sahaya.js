/* sahaya.js — the dumb front end. No fetch, no CDN: the pages work straight from the
   file system (file://), which is what the school lab's dark network requires. Every
   learning DECISION lives in learning_engine.py; the browser only echoes it. */
"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const cards = Array.from(document.querySelectorAll(".card"));
  let idx = 0;
  function advance() {
    if (idx + 1 < cards.length) { idx += 1; cards[idx].scrollIntoView({block:"center"}); }
  }
  cards.forEach((card) => {
    const answer = card.dataset.answer;
    const feedback = card.querySelector(".feedback");
    card.querySelectorAll(".opt").forEach((b) => {
      b.addEventListener("click", () => {
        const ok = b.textContent.trim() === answer.trim();
        feedback.textContent = ok ? "ಸರಿಯಾಗಿದೆ! Correct." : "ಪುನಃ ಪ್ರಯತ್ನಿಸಿ. Try again.";
        feedback.style.color = ok ? "var(--accent)" : "var(--warn)";
        if (ok) setTimeout(advance, 1200);
      });
    });
  });
});
