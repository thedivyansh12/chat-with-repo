FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
ENV MAVEN_OPTS="-Xms64m -Xmx384m -XX:+UseSerialGC"
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/chat-with-repo-0.1.0.jar app.jar
ENV JAVA_TOOL_OPTIONS="-XX:+UseSerialGC -Xms64m -Xmx220m -XX:MaxMetaspaceSize=112m -XX:ReservedCodeCacheSize=48m -Xss512k"
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
