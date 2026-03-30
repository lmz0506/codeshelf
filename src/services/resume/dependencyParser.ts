import { readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { DependencyAnalysis } from "@/types/resume";

// 敏感文件模式 - 这些文件不会被读取
const SENSITIVE_FILE_PATTERNS = [
  /^\.env/,                          // .env, .env.local, .env.production 等
  /^\.env\.*/,                       // .env.*
  /^config\.json$/i,                 // config.json
  /^config\.local\.json$/i,          // config.local.json
  /^secrets?\.json$/i,               // secret.json, secrets.json
  /^credentials?\.json$/i,           // credential.json, credentials.json
  /^\.aws$/i,                        // AWS 配置目录
  /^\.ssh$/i,                        // SSH 密钥目录
  /^id_rsa$/i,                       // SSH 私钥
  /^id_dsa$/i,                       // SSH DSA 私钥
  /^id_ecdsa$/i,                     // SSH ECDSA 私钥
  /^id_ed25519$/i,                   // SSH ED25519 私钥
  /^.*\.key$/i,                      // 任何 .key 文件
  /^.*\.pem$/i,                      // 任何 .pem 文件
  /^.*\.p12$/i,                      // P12 证书
  /^.*\.pfx$/i,                      // PFX 证书
  /^docker-compose.*\.yml$/i,        // docker-compose 文件（可能包含敏感环境变量）
  /^\.htpasswd$/i,                   // Apache 密码文件
  /^\.netrc$/i,                      // netrc 认证文件
  /^_netrc$/i,                       // Windows netrc
  /^npmrc$/i,                        // npm 配置（可能包含 token）
  /^\.npmrc$/i,                      // npm 配置（可能包含 token）
  /^yarnrc$/i,                       // yarn 配置
  /^\.yarnrc$/i,                     // yarn 配置
  /^pip\.conf$/i,                    // pip 配置
  /^\.pypirc$/i,                     // PyPI 配置（可能包含密码）
  /^.*\.keystore$/i,                 // 密钥库文件
  /^.*\.jks$/i,                      // Java 密钥库
];

// 敏感内容关键词 - 包含这些关键词的内容会被过滤
const SENSITIVE_CONTENT_KEYWORDS = [
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "private_key",
  "access_key",
  "client_secret",
  "authorization",
  "bearer",
];

/**
 * 检查文件是否是敏感文件
 */
function isSensitiveFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return SENSITIVE_FILE_PATTERNS.some((p) =>
    p.test(lowerFilename)
  );
}

/**
 * 过滤敏感内容
 */
function filterSensitiveContent(content: string): string {
  // 简单的内容过滤 - 移除可能包含敏感信息的行
  const lines = content.split("\n");
  const filteredLines = lines.filter((line) => {
    const lowerLine = line.toLowerCase();
    // 如果行包含敏感关键词且包含等号或冒号（可能是键值对），则过滤掉
    return !SENSITIVE_CONTENT_KEYWORDS.some((keyword) => {
      const keywordLower = keyword.toLowerCase();
      return lowerLine.includes(keywordLower) &&
        (lowerLine.includes("=") || lowerLine.includes(":") || lowerLine.includes("\""));
    });
  });
  return filteredLines.join("\n");
}

/**
 * 解析项目依赖文件，提取技术栈信息
 */
export async function parseProjectDependencies(projectPath: string): Promise<DependencyAnalysis | null> {
  try {
    // 尝试各种依赖文件
    const parsers = [
      { files: ["package.json"], parser: parsePackageJson },
      { files: ["pom.xml"], parser: parsePomXml },
      { files: ["build.gradle", "build.gradle.kts"], parser: parseGradle },
      { files: ["Cargo.toml"], parser: parseCargoToml },
      { files: ["go.mod"], parser: parseGoMod },
      { files: ["requirements.txt"], parser: parseRequirementsTxt },
      { files: ["pyproject.toml"], parser: parsePyProjectToml },
      { files: ["composer.json"], parser: parseComposerJson },
      { files: ["Gemfile"], parser: parseGemfile },
      { files: ["*.csproj"], parser: parseCsproj },
    ];

    for (const { files, parser } of parsers) {
      for (const file of files) {
        // 跳过敏感文件
        if (isSensitiveFile(file)) {
          console.log(`[简历生成] 跳过敏感文件: ${file}`);
          continue;
        }

        try {
          const content = await readDependencyFile(projectPath, file);
          if (content) {
            // 过滤敏感内容后再解析
            const filteredContent = filterSensitiveContent(content);
            return await parser(filteredContent);
          }
        } catch {
          // 继续尝试下一个文件
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 读取依赖文件内容
 */
async function readDependencyFile(projectPath: string, filename: string): Promise<string | null> {
  try {
    const filePath = await join(projectPath, filename);
    return await readTextFile(filePath);
  } catch {
    return null;
  }
}

/**
 * 解析 package.json (Node.js)
 */
async function parsePackageJson(content: string): Promise<DependencyAnalysis> {
  const json = JSON.parse(content);
  const deps = { ...json.dependencies, ...json.devDependencies };

  // 检测框架
  let framework: string | undefined;
  if (deps.vue) framework = "Vue";
  else if (deps.react || deps["react-dom"]) framework = "React";
  else if (deps.angular || deps["@angular/core"]) framework = "Angular";
  else if (deps.svelte) framework = "Svelte";
  else if (deps.next) framework = "Next.js";
  else if (deps.nuxt) framework = "Nuxt";
  else if (deps.express) framework = "Express";
  else if (deps.koa) framework = "Koa";
  else if (deps.nestjs || deps["@nestjs/core"]) framework = "NestJS";
  else if (deps.electron) framework = "Electron";

  // 关键库
  const keyLibraries: string[] = [];
  const libPatterns: Record<string, string> = {
    typescript: "TypeScript",
    webpack: "Webpack",
    vite: "Vite",
    rollup: "Rollup",
    esbuild: "esbuild",
    swc: "SWC",
    tailwindcss: "Tailwind CSS",
    "styled-components": "styled-components",
    sass: "Sass",
    less: "Less",
    axios: "Axios",
    lodash: "Lodash",
    moment: "Moment.js",
    "date-fns": "date-fns",
    rxjs: "RxJS",
    redux: "Redux",
    zustand: "Zustand",
    pinia: "Pinia",
    mobx: "MobX",
    prisma: "Prisma",
    sequelize: "Sequelize",
    mongoose: "Mongoose",
    typeorm: "TypeORM",
    jest: "Jest",
    vitest: "Vitest",
    cypress: "Cypress",
    playwright: "Playwright",
    storybook: "Storybook",
    eslint: "ESLint",
    prettier: "Prettier",
  };

  for (const [dep, name] of Object.entries(libPatterns)) {
    if (deps[dep]) {
      keyLibraries.push(name);
    }
  }

  // 开发工具
  const devTools: string[] = [];
  if (json.scripts) {
    if (json.scripts.build?.includes("vite")) devTools.push("Vite");
    if (json.scripts.build?.includes("webpack")) devTools.push("Webpack");
    if (json.scripts.test) devTools.push("测试工具");
    if (json.scripts.lint) devTools.push("代码检查");
  }

  // 架构线索
  const architectureHints: string[] = [];
  if (deps["@monorepo"] || deps["lerna"] || deps.nx) {
    architectureHints.push("Monorepo");
  }
  if (deps["micro-frontend"] || deps["module-federation"]) {
    architectureHints.push("微前端");
  }
  if (deps.serverless || deps["serverless-http"]) {
    architectureHints.push("Serverless");
  }

  return {
    language: "JavaScript/TypeScript",
    framework,
    keyLibraries: [...new Set(keyLibraries)],
    devTools: [...new Set(devTools)],
    architectureHints,
  };
}

/**
 * 解析 pom.xml (Java Maven)
 */
async function parsePomXml(content: string): Promise<DependencyAnalysis> {
  const framework = content.includes("spring-boot") ? "Spring Boot" :
                    content.includes("spring") ? "Spring" :
                    content.includes("quarkus") ? "Quarkus" :
                    content.includes("micronaut") ? "Micronaut" : undefined;

  const keyLibraries: string[] = [];
  if (content.includes("mybatis")) keyLibraries.push("MyBatis");
  if (content.includes("hibernate")) keyLibraries.push("Hibernate/JPA");
  if (content.includes("dubbo")) keyLibraries.push("Dubbo");
  if (content.includes("netty")) keyLibraries.push("Netty");
  if (content.includes("kafka")) keyLibraries.push("Kafka");
  if (content.includes("rabbitmq")) keyLibraries.push("RabbitMQ");
  if (content.includes("redis")) keyLibraries.push("Redis");
  if (content.includes("elasticsearch")) keyLibraries.push("Elasticsearch");
  if (content.includes("shardingsphere")) keyLibraries.push("ShardingSphere");

  const architectureHints: string[] = [];
  if (content.includes("microservice") || content.includes("spring-cloud")) {
    architectureHints.push("微服务");
  }

  return {
    language: "Java",
    framework,
    keyLibraries: [...new Set(keyLibraries)],
    devTools: ["Maven"],
    architectureHints,
  };
}

/**
 * 解析 build.gradle (Gradle)
 */
async function parseGradle(content: string): Promise<DependencyAnalysis> {
  const framework = content.includes("spring-boot") ? "Spring Boot" :
                    content.includes("spring") ? "Spring" :
                    content.includes("android") ? "Android" :
                    content.includes("quarkus") ? "Quarkus" : undefined;

  const keyLibraries: string[] = [];
  if (content.includes("kotlin")) keyLibraries.push("Kotlin");
  if (content.includes("groovy")) keyLibraries.push("Groovy");
  if (content.includes("rxjava")) keyLibraries.push("RxJava");
  if (content.includes("retrofit")) keyLibraries.push("Retrofit");
  if (content.includes("okhttp")) keyLibraries.push("OkHttp");

  return {
    language: content.includes("kotlin") ? "Kotlin" : "Java",
    framework,
    keyLibraries,
    devTools: ["Gradle"],
    architectureHints: [],
  };
}

/**
 * 解析 Cargo.toml (Rust)
 */
async function parseCargoToml(content: string): Promise<DependencyAnalysis> {
  // 简单解析
  const keyLibraries: string[] = [];
  if (content.includes("tokio")) keyLibraries.push("Tokio");
  if (content.includes("actix-web")) keyLibraries.push("Actix-web");
  if (content.includes("axum")) keyLibraries.push("Axum");
  if (content.includes("rocket")) keyLibraries.push("Rocket");
  if (content.includes("diesel")) keyLibraries.push("Diesel");
  if (content.includes("sqlx")) keyLibraries.push("SQLx");
  if (content.includes("serde")) keyLibraries.push("Serde");

  return {
    language: "Rust",
    framework: content.includes("actix") ? "Actix" :
                content.includes("axum") ? "Axum" :
                content.includes("rocket") ? "Rocket" : undefined,
    keyLibraries,
    devTools: ["Cargo"],
    architectureHints: [],
  };
}

/**
 * 解析 go.mod (Go)
 */
async function parseGoMod(content: string): Promise<DependencyAnalysis> {
  const keyLibraries: string[] = [];
  if (content.includes("gin-gonic")) keyLibraries.push("Gin");
  if (content.includes("echo")) keyLibraries.push("Echo");
  if (content.includes("fiber")) keyLibraries.push("Fiber");
  if (content.includes("gorm")) keyLibraries.push("GORM");
  if (content.includes("grpc")) keyLibraries.push("gRPC");
  if (content.includes("kitex")) keyLibraries.push("Kitex");
  if (content.includes("kratos")) keyLibraries.push("Kratos");
  if (content.includes("cobra")) keyLibraries.push("Cobra");
  if (content.includes("viper")) keyLibraries.push("Viper");

  return {
    language: "Go",
    framework: content.includes("gin") ? "Gin" :
                content.includes("echo") ? "Echo" :
                content.includes("fiber") ? "Fiber" :
                content.includes("beego") ? "Beego" : undefined,
    keyLibraries,
    devTools: ["Go Modules"],
    architectureHints: [],
  };
}

/**
 * 解析 requirements.txt (Python)
 */
async function parseRequirementsTxt(content: string): Promise<DependencyAnalysis> {
  const lines = content.split("\n");
  const deps = lines
    .map((line) => line.split("==")[0].split(">=")[0].split("[")[0].trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"));

  const allDeps = deps.join(" ");

  const framework = allDeps.includes("django") ? "Django" :
                    allDeps.includes("flask") ? "Flask" :
                    allDeps.includes("fastapi") ? "FastAPI" :
                    allDeps.includes("tornado") ? "Tornado" :
                    allDeps.includes("pyramid") ? "Pyramid" : undefined;

  const keyLibraries: string[] = [];
  if (allDeps.includes("sqlalchemy")) keyLibraries.push("SQLAlchemy");
  if (allDeps.includes("pandas")) keyLibraries.push("Pandas");
  if (allDeps.includes("numpy")) keyLibraries.push("NumPy");
  if (allDeps.includes("requests")) keyLibraries.push("Requests");
  if (allDeps.includes("celery")) keyLibraries.push("Celery");
  if (allDeps.includes("redis")) keyLibraries.push("Redis-Py");
  if (allDeps.includes("pytest")) keyLibraries.push("Pytest");
  if (allDeps.includes("scrapy")) keyLibraries.push("Scrapy");
  if (allDeps.includes("tensorflow")) keyLibraries.push("TensorFlow");
  if (allDeps.includes("pytorch") || allDeps.includes("torch")) keyLibraries.push("PyTorch");

  return {
    language: "Python",
    framework,
    keyLibraries: [...new Set(keyLibraries)],
    devTools: ["pip"],
    architectureHints: [],
  };
}

/**
 * 解析 pyproject.toml (Python)
 */
async function parsePyProjectToml(content: string): Promise<DependencyAnalysis> {
  const framework = content.includes("poetry") ? undefined :
                    content.includes("django") ? "Django" :
                    content.includes("flask") ? "Flask" :
                    content.includes("fastapi") ? "FastAPI" : undefined;

  return {
    language: "Python",
    framework,
    keyLibraries: [],
    devTools: content.includes("poetry") ? ["Poetry"] : ["pip"],
    architectureHints: [],
  };
}

/**
 * 解析 composer.json (PHP)
 */
async function parseComposerJson(content: string): Promise<DependencyAnalysis> {
  const json = JSON.parse(content);
  const deps = { ...json.require, ...json["require-dev"] };
  const allDeps = Object.keys(deps).join(" ").toLowerCase();

  const framework = allDeps.includes("laravel") ? "Laravel" :
                    allDeps.includes("symfony") ? "Symfony" :
                    allDeps.includes("zend") || allDeps.includes("laminas") ? "Laminas" :
                    allDeps.includes("yii") ? "Yii" :
                    allDeps.includes("cakephp") ? "CakePHP" : undefined;

  const keyLibraries: string[] = [];
  if (allDeps.includes("doctrine")) keyLibraries.push("Doctrine");
  if (allDeps.includes("eloquent")) keyLibraries.push("Eloquent");
  if (allDeps.includes("phpunit")) keyLibraries.push("PHPUnit");
  if (allDeps.includes("guzzle")) keyLibraries.push("Guzzle");
  if (allDeps.includes("monolog")) keyLibraries.push("Monolog");
  if (allDeps.includes("redis")) keyLibraries.push("PhpRedis");

  return {
    language: "PHP",
    framework,
    keyLibraries,
    devTools: ["Composer"],
    architectureHints: [],
  };
}

/**
 * 解析 Gemfile (Ruby)
 */
async function parseGemfile(content: string): Promise<DependencyAnalysis> {
  const framework = content.includes("rails") ? "Ruby on Rails" :
                    content.includes("sinatra") ? "Sinatra" :
                    content.includes("hanami") ? "Hanami" : undefined;

  const keyLibraries: string[] = [];
  if (content.includes("sidekiq")) keyLibraries.push("Sidekiq");
  if (content.includes("devise")) keyLibraries.push("Devise");
  if (content.includes("pundit")) keyLibraries.push("Pundit");
  if (content.includes("rspec")) keyLibraries.push("RSpec");

  return {
    language: "Ruby",
    framework,
    keyLibraries,
    devTools: ["Bundler"],
    architectureHints: [],
  };
}

/**
 * 解析 .csproj (.NET)
 */
async function parseCsproj(content: string): Promise<DependencyAnalysis> {
  const framework = content.includes("Microsoft.NET.Sdk.Web") ? "ASP.NET Core" :
                    content.includes("Microsoft.NET.Sdk.Blazor") ? "Blazor" :
                    content.includes("Microsoft.NET.Sdk") ? ".NET Core" : undefined;

  const keyLibraries: string[] = [];
  if (content.includes("EntityFrameworkCore")) keyLibraries.push("EF Core");
  if (content.includes("Dapper")) keyLibraries.push("Dapper");
  if (content.includes("AutoMapper")) keyLibraries.push("AutoMapper");
  if (content.includes("MediatR")) keyLibraries.push("MediatR");
  if (content.includes("xunit")) keyLibraries.push("xUnit");
  if (content.includes("nunit")) keyLibraries.push("NUnit");

  return {
    language: "C#",
    framework,
    keyLibraries,
    devTools: ["NuGet", "MSBuild"],
    architectureHints: [],
  };
}

/**
 * 合并多个依赖分析结果
 */
export function mergeDependencyAnalyses(analyses: DependencyAnalysis[]): DependencyAnalysis {
  const languages = [...new Set(analyses.map((a) => a.language))];
  const frameworks = [...new Set(analyses.map((a) => a.framework).filter(Boolean))];
  const allLibraries = analyses.flatMap((a) => a.keyLibraries);
  const allDevTools = analyses.flatMap((a) => a.devTools);
  const allArchitectureHints = analyses.flatMap((a) => a.architectureHints);

  return {
    language: languages.join(" / "),
    framework: frameworks.join(" / ") || undefined,
    keyLibraries: [...new Set(allLibraries)],
    devTools: [...new Set(allDevTools)],
    architectureHints: [...new Set(allArchitectureHints)],
  };
}
