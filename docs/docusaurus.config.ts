import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "jobpull",
  tagline: "Self-hosted job board docs and operator guides",
  url: "https://farmanp.github.io",
  baseUrl: "/jobpull/",
  onBrokenLinks: "throw",
  favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%94%8D%3C/text%3E%3C/svg%3E",
  organizationName: "farmanp",
  projectName: "jobpull",
  trailingSlash: false,
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "content",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts"
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 630'%3E%3Crect width='1200' height='630' fill='%23111827'/%3E%3Ctext x='80' y='280' fill='%23f8fafc' font-size='72' font-family='Arial'%3Ejobpull%3C/text%3E%3Ctext x='80' y='370' fill='%2394a3b8' font-size='34' font-family='Arial'%3EDocs and operator guides%3C/text%3E%3C/svg%3E",
    navbar: {
      title: "jobpull",
      items: [
        { to: "/docs/intro", label: "Docs", position: "left" },
        { to: "/docs/getting-started/cloudflare-quickstart", label: "Cloudflare", position: "left" },
        { to: "/docs/getting-started/docker-compose", label: "Docker", position: "left" },
        { to: "/docs/guides/customization", label: "Customize", position: "left" },
        { href: "https://github.com/farmanp/jobpull", label: "GitHub", position: "right" }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Guides",
          items: [
            { label: "Overview", to: "/docs/intro" },
            { label: "Starter Packs", to: "/docs/guides/starter-packs" },
            { label: "Customization", to: "/docs/guides/customization" },
            { label: "Operations", to: "/docs/guides/operations" }
          ]
        },
        {
          title: "Deployment",
          items: [
            { label: "Cloudflare Quick Start", to: "/docs/getting-started/cloudflare-quickstart" },
            { label: "Docker Compose", to: "/docs/getting-started/docker-compose" }
          ]
        },
        {
          title: "Repo",
          items: [
            { label: "GitHub", href: "https://github.com/farmanp/jobpull" },
            { label: "Issues", href: "https://github.com/farmanp/jobpull/issues" }
          ]
        }
      ],
      copyright: `Copyright ${new Date().getFullYear()} jobpull`
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula
    }
  } satisfies Preset.ThemeConfig
};

export default config;
