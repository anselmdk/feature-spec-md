import { html } from "./html.js";
import { githubReportMetadataFromEnv } from "./githubReportMetadata.js";
import {
  insertReportMetadata,
  type ReportMetadataItem,
} from "./reportMetadata.js";
import {
  indentTemplateBlock,
  reportPageDefaults,
} from "./reportTemplates/shared.js";

export type HtmlPageOptions = {
  title: string;
  body: string;
  styles?: string;
  scripts?: string;
  maxWidth?: string;
  metadata?: ReportMetadataItem[];
};

export function renderHtmlPage({
  title,
  body,
  styles = "",
  scripts = "",
  maxWidth,
  metadata = githubReportMetadataFromEnv(),
}: HtmlPageOptions) {
  const defaults = reportPageDefaults(maxWidth, styles);
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <script>(function(){var saved;try{saved=localStorage.getItem("feature-spec-md-theme");}catch(error){}var dark=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=saved|| (dark?"dark":"light");})();</script>
  <style>
    :root {
      color-scheme: light;
      --bg: #ffffff;
      --fg: #1f2328;
      --surface: #ffffff;
      --surface-muted: #f6f8fa;
      --surface-hover: #eef2f6;
      --border: #d0d7de;
      --muted: #57606a;
      --link: #0969da;
      --success: #1a7f37;
      --danger: #cf222e;
      --warning: #9a6700;
      --diff-added: #dafbe1;
      --diff-removed: #ffebe9;
      --overlay: rgba(0, 0, 0, .82);
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0d1117;
      --fg: #e6edf3;
      --surface: #161b22;
      --surface-muted: #21262d;
      --surface-hover: #30363d;
      --border: #3d444d;
      --muted: #9198a1;
      --link: #58a6ff;
      --success: #3fb950;
      --danger: #f85149;
      --warning: #d29922;
      --diff-added: #12261e;
      --diff-removed: #2d1517;
      --overlay: rgba(0, 0, 0, .9);
    }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      max-width: ${defaults.maxWidth};
      margin: 0 auto;
      padding: 40px 24px;
      color: var(--fg);
      background: var(--bg);
      line-height: 1.5;
    }
    .theme-toggle { position: fixed; z-index: 20; bottom: 12px; left: 12px; display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--fg); cursor: pointer; font: inherit; font-size: 19px; line-height: 1; padding: 0; }
    .theme-toggle:hover { background: var(--surface-hover); }
    .theme-toggle:focus-visible, [data-lightbox]:focus-visible, .lightbox-close:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
    [data-lightbox] { cursor: zoom-in; }
    .image-lightbox { width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: transparent; overflow: hidden; }
    .image-lightbox::backdrop { background: var(--overlay); }
    .lightbox-close { position: fixed; z-index: 2; top: 14px; right: 14px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px; background: rgba(0,0,0,.72); color: white; cursor: pointer; font: inherit; font-weight: 700; padding: 8px 13px; }
    .lightbox-viewport { width: 100%; height: 100%; overflow: auto; padding: 56px 24px 24px; }
    .lightbox-viewport img { display: block; width: auto; height: auto; max-width: none; max-height: none; margin: 0 auto; background: white; }
${indentTemplateBlock(defaults.styleText, 4)}
  </style>
</head>
<body>
  <button class="theme-toggle" type="button" aria-label="Toggle dark mode"></button>
${indentTemplateBlock(body, 2)}
${scripts ? indentTemplateBlock(scripts, 2) : ""}
  <dialog class="image-lightbox" aria-label="Screenshot viewer">
    <button class="lightbox-close" type="button">Close</button>
    <div class="lightbox-viewport"><img alt=""></div>
  </dialog>
  <script>
    (function(){
      var root=document.documentElement;
      var themeButton=document.querySelector(".theme-toggle");
      function updateThemeButton(){var dark=root.dataset.theme==="dark";themeButton.textContent=dark?"☀":"☾";themeButton.title=dark?"Use light mode":"Use dark mode";}
      themeButton.addEventListener("click",function(){
        root.dataset.theme=root.dataset.theme==="dark"?"light":"dark";
        try{localStorage.setItem("feature-spec-md-theme",root.dataset.theme);}catch(error){}
        updateThemeButton();
        document.dispatchEvent(new CustomEvent("feature-spec-theme-change",{detail:{theme:root.dataset.theme}}));
      });
      updateThemeButton();

      var dialog=document.querySelector(".image-lightbox");
      var viewer=dialog.querySelector("img");
      function openImage(target){viewer.src=target.currentSrc||target.src;viewer.alt=target.alt||"Screenshot";dialog.showModal();dialog.querySelector(".lightbox-viewport").scrollTo(0,0);}
      document.addEventListener("click",function(event){var target=event.target.closest("img[data-lightbox]");if(target){event.preventDefault();openImage(target);}});
      document.addEventListener("keydown",function(event){var target=event.target;if((event.key==="Enter"||event.key===" ")&&target instanceof HTMLImageElement&&target.matches("[data-lightbox]")){event.preventDefault();openImage(target);}});
      dialog.querySelector(".lightbox-close").addEventListener("click",function(){dialog.close();});
      dialog.addEventListener("click",function(event){if(event.target===dialog)dialog.close();});
    })();
  </script>
</body>
</html>
`;

  return insertReportMetadata(page, metadata);
}
