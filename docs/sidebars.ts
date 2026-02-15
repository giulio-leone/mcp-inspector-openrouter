import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'getting-started',
    'architecture',
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/ports-overview',
        'api/agent-port',
        'api/tool-execution-port',
        'api/planning-port',
        'api/subagent-port',
        'api/context-port',
      ],
    },
    'platform-support',
    'configurable-limits',
  ],
};

export default sidebars;
