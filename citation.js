(() => {
  const entry = document.getElementById("bibtex-entry");
  const button = document.getElementById("copy-bibtex");
  if (!entry.textContent.trim()) return;

  button.disabled = false;
  button.addEventListener("click", async () => {
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
  });
})();
