use std::path::Path;

fn detect_template(root: &Path, requested: Option<&str>) -> String {
    if let Some(template) = requested {
        if template != "auto" {
            return template.to_string();
        }
    }
    if root.join("package.json").exists() {
        "node".into()
    } else if root.join("pom.xml").exists() {
        "java-maven".into()
    } else if root.join("Cargo.toml").exists() {
        "rust".into()
    } else if root.join("requirements.txt").exists() || root.join("pyproject.toml").exists() {
        "python".into()
    } else {
        "static-nginx".into()
    }
}

pub(super) fn generate_template(root: &Path, requested: Option<&str>) -> String {
    let kind = detect_template(root, requested);
    let content = match kind.as_str() {
        "node" => {
            r#"FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"#
        }
        "java-maven" => {
            r#"FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
"#
        }
        "rust" => {
            r#"FROM rust:1-bookworm AS build
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/target/release/app /usr/local/bin/app
CMD ["app"]
"#
        }
        "python" => {
            r#"FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]
"#
        }
        _ => {
            r#"FROM nginx:stable-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"#
        }
    };
    content.to_string()
}
