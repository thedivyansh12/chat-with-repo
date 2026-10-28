FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
ENV MAVEN_OPTS="-Xms64m -Xmx384m -XX:+UseSerialGC"
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/chat-with-repo-0.1.0.jar app.jar
ENV DJL_CACHE_DIR=/tmp/djl-cache
ENV HF_HOME=/tmp/hf-cache
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xms32m -Xmx128m -XX:MaxMetaspaceSize=80m -XX:ReservedCodeCacheSize=32m -Xss256k"
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
