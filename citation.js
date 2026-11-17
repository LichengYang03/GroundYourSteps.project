(() => {
  const entry = document.getElementById("bibtex-entry");
  if (!entry.textContent.trim()) return;

  async function copyEntry(event) {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(entry.textContent.trim());
      button.textContent = "Copied";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(entry);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Copy selection";
    }
  }

  for (const button of document.querySelectorAll(".copy-bibtex")) {
    button.disabled = false;
    button.addEventListener("click", copyEntry);
  }
})();
