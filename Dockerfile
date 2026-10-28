FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /tmp/djl-cache /tmp/onnx-cache && chmod -R 777 /tmp/djl-cache /tmp/onnx-cache
COPY --from=build /app/target/chat-with-repo-0.1.0.jar app.jar
ENV PORT=8080
ENV DJL_CACHE_DIR=/tmp/djl-cache
ENV ENGINE_CACHE_DIR=/tmp/djl-cache
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xms64m -Xmx240m -XX:MaxMetaspaceSize=96m -XX:ReservedCodeCacheSize=32m -Xss256k"
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
