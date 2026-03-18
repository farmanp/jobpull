import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: [
        "getting-started/cloudflare-quickstart",
        "getting-started/docker-compose"
      ]
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/starter-packs",
        "guides/source-feeds",
        "guides/operations"
      ]
    },
    {
      type: "category",
      label: "Reference",
      items: ["reference/api"]
    }
  ]
};

export default sidebars;
