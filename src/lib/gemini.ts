import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeneratedTaskTemplate {
  domain: string;
  title: string;
  description: string;
  deliverables: string;
  orientationNotes: string;
}

const DEFAULT_DOMAIN_TEMPLATES: Record<string, Omit<GeneratedTaskTemplate, 'domain'>> = {
  'web development': {
    title: 'Full-Stack Modern Web Application with Next.js & REST/GraphQL API',
    description:
      'Interns will design and build a high-performance full-stack web application. The project requires implementing secure user authentication, responsive UI components, database persistence, and automated RESTful endpoints.',
    deliverables:
      '- Functional Next.js/React frontend with responsive design\n- Secure API endpoints with validation and error handling\n- Relational or NoSQL database integration with migrations\n- Git repository with comprehensive README, setup instructions, and architecture overview',
    orientationNotes:
      "Welcome to your Web Development internship! You'll be building an end-to-end full-stack web application. We want you to focus on writing clean, modular code and crafting an intuitive user experience. Make sure your repository has clear documentation and sensible commit messages. Take your time to review the architecture, and don't hesitate to ask questions as you build.",
  },
  'machine learning': {
    title: 'Predictive Modeling & Feature Engineering Pipeline with Evaluation Dashboard',
    description:
      'Interns will develop an end-to-end machine learning pipeline starting from exploratory data analysis (EDA) and data preprocessing to model training, hyperparameter tuning, and metric evaluation. The project concludes with a lightweight model inference API or demo interface.',
    deliverables:
      '- Jupyter notebook or clean scripts for data cleaning, preprocessing, and EDA\n- Trained predictive model with logged baseline vs tuned metrics (F1, RMSE, ROC-AUC)\n- Exported model artifacts and inference API or script\n- Technical summary report outlining model performance, feature importance, and production considerations',
    orientationNotes:
      "Hello and welcome to the Machine Learning track! Over the next weeks, you will build a complete predictive modeling pipeline. The emphasis is on disciplined data exploration, thoughtful feature engineering, and honest metric evaluation. Don't worry about building the most complex neural net; focus on reproducible experiments and clear code. We are excited to see what insights you uncover.",
  },
  'ui/ux design': {
    title: 'Design System & Interactive SaaS Product Prototype',
    description:
      'Interns will lead the user research, wireframing, component-driven design system creation, and interactive high-fidelity prototyping for a modern web product. Work will be evaluated based on usability principles, accessibility standards, and visual consistency.',
    deliverables:
      '- User persona research and key journey workflow maps\n- Component design system with typography, color tokens, and responsive UI components\n- Interactive clickable Figma/prototype link covering major user journeys\n- Usability testing summary documenting user feedback and design iterations',
    orientationNotes:
      "Welcome aboard to UI/UX Design! Your mission is to take an ambiguous problem and transform it into an intuitive, visually stunning experience. You will build user flows, craft a reusable design system, and produce interactive prototypes. Keep user empathy at the center of every decision. We look forward to seeing your creativity in action.",
  },
  'cloud devops': {
    title: 'Automated CI/CD Pipeline & Containerized Infrastructure as Code',
    description:
      'Interns will create an automated deployment pipeline utilizing Docker, GitHub Actions, and Infrastructure as Code (Terraform or CloudFormation). The setup includes automated linting, test runners, container registry builds, and zero-downtime deployment scripts.',
    deliverables:
      '- Production-grade Dockerfiles for multi-stage microservices\n- Automated GitHub Actions CI/CD workflows with automated linting and tests\n- Infrastructure as Code scripts for automated provisioning\n- Architecture diagram and operational runbook documenting rollback and monitoring strategies',
    orientationNotes:
      "Welcome to Cloud DevOps! Your focus is building reliable, automated delivery pipelines. You will containerize applications, configure automated testing in GitHub Actions, and practice Infrastructure as Code. In DevOps, reliability and repeatability are key. Keep your scripts organized, document your environment variables, and let's get automating.",
  },
  'data science': {
    title: 'Exploratory Data Analysis, Statistical Testing & Executive Insights Dashboard',
    description:
      'Interns will ingest complex datasets, perform statistical hypothesis testing, extract actionable business trends, and deliver an interactive data storytelling dashboard.',
    deliverables:
      '- Documented data cleaning pipeline handling missing values and outliers\n- Statistical significance testing and correlation analysis\n- Interactive dashboard (Streamlit, PowerBI, or Next.js visualization)\n- Executive presentation summarizing key findings and actionable business recommendations',
    orientationNotes:
      "Welcome to Data Science! Your goal is to transform raw data into clear, actionable stories. Dig deep into the numbers, validate assumptions with statistical tests, and present your findings cleanly. We love seeing well-commented code and intuitive visualizations.",
  },
};

/**
 * Generates a structured Task Template for any internship domain.
 * Uses Gemini API if GEMINI_API_KEY is configured, or falls back to
 * high-quality domain presets / heuristic generation.
 */
export async function generateTaskTemplateForDomain(domain: string): Promise<GeneratedTaskTemplate> {
  const normalizedDomain = domain.trim().toLowerCase();

  // Check fallback dictionary first for exact or fuzzy match
  for (const [key, preset] of Object.entries(DEFAULT_DOMAIN_TEMPLATES)) {
    if (normalizedDomain.includes(key) || key.includes(normalizedDomain)) {
      // If we don't have a Gemini API key, return the curated preset immediately
      if (!process.env.GEMINI_API_KEY) {
        return {
          domain: domain.trim(),
          ...preset,
        };
      }
    }
  }

  // Try generating via Gemini API
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `
You are an expert internship curriculum director and engineering mentor.
Create a comprehensive, production-ready internship task template for a student in the domain: "${domain}".

Respond strictly with valid JSON without any markdown formatting or code fences:
{
  "title": "Clear, exciting project title (6-12 words)",
  "description": "Comprehensive project description (2-3 paragraphs) detailing the background, core requirements, and technical expectations.",
  "deliverables": "Markdown-bulleted list of 4-6 concrete deliverables, code requirements, and documentation standards.",
  "orientationNotes": "A warm, natural, human mentor script (4-6 sentences) explaining the assignment to the intern during their orientation. Use short sentences, contractions, and an encouraging tone. Do not include bullet points or markdown symbols in orientationNotes."
}
`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const cleanJson = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        domain: domain.trim(),
        title: parsed.title || `${domain} Internship Capstone Project`,
        description: parsed.description || `Practical, hands-on capstone project focused on real-world industry competencies in ${domain}.`,
        deliverables: parsed.deliverables || `- Core project implementation in ${domain}\n- Clean documentation and setup instructions\n- Code repository with tests and demo`,
        orientationNotes: parsed.orientationNotes || `Welcome to your ${domain} internship! You will be working on a hands-on project that mirrors real industry challenges. We want you to explore, learn, and build with confidence. Do your best, ask questions whenever you need clarity, and we look forward to reviewing your progress.`,
      };
    } catch (err) {
      console.warn(`[Gemini TaskTemplate] Gemini call failed for domain "${domain}". Falling back to curated template. Error:`, err);
    }
  }

  // Fallback if Gemini is not configured or failed
  return {
    domain: domain.trim(),
    title: `${domain.trim()} Hands-On Industry Capstone Project`,
    description: `During this internship, you will design, implement, and deliver a comprehensive project in ${domain.trim()}. You will apply industry best practices, build scalable solutions, and demonstrate core competencies through practical application and code delivery.`,
    deliverables: `- Clean, modular project implementation addressing domain requirements\n- Repository documentation with setup instructions and architecture overview\n- Code quality and performance optimizations\n- Final demo and progress walkthrough for review`,
    orientationNotes: `Welcome to your ${domain.trim()} internship! You are going to be building a real-world project from start to finish. We are here to guide you, so take it step by step and focus on clean, solid execution. You will have regular check-ins to review your work and answer any questions. Let's make this an amazing learning experience!`,
  };
}
