// Single source of truth for all copy on the site. Mirrors Vedant_Thakre_Resume.pdf.
export const resume = {
  name: 'Vedant Thakre',
  firstName: 'VEDANT',
  lastName: 'THAKRE',
  tagline: 'Engineer · autonomous decision systems & the data infrastructure under them',
  summary:
    'Engineer building autonomous decision systems and the data infrastructure under them. B.Tech in Aerospace Engineering from IIT Bombay with a minor in Machine Intelligence and Data Science. Built Tark, a causal decision engine for consumer brands; previously the founding data engineer at Epik.',
  contact: {
    email: 'thakrevedant63@gmail.com',
    phone: '+91 9145190310',
    linkedin: 'https://linkedin.com/in/vedantthakre',
    linkedinLabel: 'linkedin.com/in/vedantthakre',
    github: 'https://github.com/VIBR0X',
    githubLabel: 'github.com/VIBR0X',
    resumePdf: '/Vedant_Thakre_Resume.pdf',
  },
  experience: [
    {
      id: 'tark',
      company: 'Tark',
      role: 'Founder & Engineer',
      period: 'Oct 2025 – Jul 2026',
      short: 'Causal decision engine for consumer brands',
      bullets: [
        'Consumer brand data sits split across ad platforms, storefront, payments and logistics with no way to trace outcomes back to causes; built Tark, a causal decision engine that closes that gap.',
        'Architected the decision core: an Observe/Think/Act/Measure state machine that calls an LLM only when a confidence gate trips, in under 5% of cycles, paired with a causal model that estimates an action’s effect before it is taken.',
        'Built the execution chain to fail closed: circuit breakers, hard caps and idempotent claiming control every action, canary testing and risk limits gate what ships, and measurement flags results it cannot confidently verify.',
      ],
      stats: [
        { value: '<5%', label: 'of cycles call an LLM' },
        { value: 'O/T/A/M', label: 'state machine' },
      ],
    },
    {
      id: 'epik',
      company: 'Epik',
      role: 'Founding Data Engineer',
      period: 'Jul 2025 – Sep 2025',
      short: 'Warehouse & real-time pipelines on BigQuery',
      bullets: [
        'Built 7 ingestion pipelines on BigQuery processing 2.3M records daily from production systems into a warehouse the team could query directly, cutting reporting time to minutes.',
        'Designed and shipped the real-time pricing and supply–demand pipelines in four weeks, replacing manual estimates with live numbers.',
      ],
      stats: [
        { value: '2.3M', label: 'records / day' },
        { value: '7', label: 'pipelines' },
      ],
    },
    {
      id: 'consulting',
      company: 'Independent Consulting',
      role: 'Data Engineering & Deal Sourcing',
      period: 'May 2024 – Jun 2025',
      short: 'Data systems for investment, consulting & healthcare clients',
      bullets: [
        'Delivered data engineering and automation projects for investment firms, consulting and healthcare clients, scoping each engagement directly with the client, then building and handing over the system.',
        'Built a deal-sourcing pipeline for an investment firm: crawlers processed 4,800+ companies across 9 registry and filing sources, with an LLM layer scoring each target against the fund’s thesis.',
      ],
      stats: [
        { value: '4,800+', label: 'companies crawled' },
        { value: '9', label: 'registry sources' },
      ],
    },
    {
      id: 'devcom',
      company: 'DevCom, IIT Bombay',
      role: 'Project Lead',
      period: 'Dec 2022 – Mar 2024',
      short: 'Led the 21-developer team behind every core campus product',
      bullets: [
        'Elected to lead DevCom, IIT Bombay’s 21-developer team owning every core digital product on campus, from InstiApp to internal tools; ran the roadmap, release cycle, hiring and annual budget.',
        'Overhauled InstiApp with a new design system and sustained performance work, driving a 10% MAU increase across 5,000+ active students; earlier built the achievement-verification and student-discussion-forum modules.',
      ],
      stats: [
        { value: '21', label: 'developers' },
        { value: '+10%', label: 'monthly active users' },
      ],
    },
  ],
  projects: [
    {
      id: 'screening',
      title: 'Rural Patient Screening',
      subtitle: 'BIRAC-funded',
      description:
        'Preliminary diagnostic screening for villages in Maharashtra, reading hospital diagnosis slips with an LLM; fine-tuned LLaMA on real slip data into a compact, domain-specific small language model.',
      tags: ['LLM', 'LLaMA fine-tune', 'Healthcare'],
    },
    {
      id: 'instiapp',
      title: 'InstiApp',
      subtitle: 'IIT Bombay campus app',
      description:
        'Core contributor and later lead of IIT Bombay’s campus app, used daily by 5,000+ students; shipped digital student IDs, meal access, achievement verification and discussion forums.',
      tags: ['5,000+ daily users', 'Dart', 'Design system'],
    },
    {
      id: 'trading',
      title: 'Intelligent Trading Agent',
      subtitle: 'Reinforcement learning',
      description:
        'Reinforcement-learning agents (DQN variants) trained and backtested on real market data for sequential decision-making under uncertainty.',
      tags: ['DQN', 'Backtesting', 'Python'],
    },
    {
      id: 'drone',
      title: 'On-Device Drone Autonomy',
      subtitle: 'Aerospace × ML',
      description:
        'Obstacle avoidance, path planning and real-time image stitching running entirely on the drone’s onboard compute rather than a ground station.',
      tags: ['Path planning', 'Vision', 'Embedded'],
    },
  ],
  skills: [
    { group: 'Languages', items: ['Python', 'TypeScript', 'JavaScript', 'SQL', 'Bash', 'Dart'] },
    { group: 'Data', items: ['Trino', 'BigQuery', 'Snowflake', 'PostgreSQL', 'Firestore', 'Redis'] },
    { group: 'Pipelines', items: ['Star schema', 'ETL / ELT', 'Event-driven', 'Semantic layers', 'Query optimisation'] },
    { group: 'Google Cloud', items: ['Cloud Run', 'Cloud Functions', 'Pub/Sub', 'Scheduler', 'Compute Engine', 'Firebase'] },
    { group: 'AI', items: ['LLM agents', 'Text-to-SQL', 'MCP servers', 'ML pipelines'] },
  ],
  education: {
    school: 'Indian Institute of Technology Bombay',
    shortSchool: 'IIT Bombay',
    degree: 'B.Tech, Aerospace Engineering',
    minor: 'Minor in Machine Intelligence and Data Science',
    coursework:
      'Coursework in machine learning, data analysis, optimisation, adaptive and learning control, control systems and flight dynamics.',
  },
  awards: [
    {
      title: 'Game Dev Hackathon Winner',
      description:
        'Winner of the institute-wide Game Dev Hackathon at IIT Bombay, which led directly to election as lead of the DevCom team.',
    },
  ],
}
