(() => {
  const section = document.getElementById("experiments");
  const panels = Array.from(section.querySelectorAll(":scope > section"));
  const bar = document.createElement("div");
  bar.className = "experiment-tabs";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-labelledby", "experiments-title");

  const tabs = panels.map((panel) => {
    const heading = panel.querySelector("h3");
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = panel.id + "-tab";
    tab.textContent = heading.textContent;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
    heading.hidden = true;
    bar.append(tab);
    return tab;
  });
  section.insertBefore(bar, panels[0]);

  function select(index) {
    panels.forEach((panel, i) => {
      const active = i === index;
      if (!active && !panel.hidden) {
        panel.querySelectorAll("video").forEach((video) => video.pause());
      }
      panel.hidden = !active;
      tabs[i].tabIndex = active ? 0 : -1;
      tabs[i].setAttribute("aria-selected", String(active));
    });
  }

  function selectFromHash() {
    const target = document.getElementById(location.hash.slice(1));
    const index = panels.findIndex((panel) => panel.contains(target));
    select(index < 0 ? 0 : index);
    if (index >= 0) {
      const anchor = target === panels[index] ? section : target;
      anchor.scrollIntoView();
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      if (tab.getAttribute("aria-selected") === "true") return;
      select(index);
      history.pushState(null, "", "#" + panels[index].id);
    });
    tab.addEventListener("keydown", (event) => {
      let next;
      switch (event.key) {
        case "ArrowRight": next = (index + 1) % tabs.length; break;
        case "ArrowLeft": next = (index - 1 + tabs.length) % tabs.length; break;
        case "Home": next = 0; break;
        case "End": next = tabs.length - 1; break;
        default: return;
      }
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  });

  selectFromHash();
  window.addEventListener("hashchange", selectFromHash);
})();
