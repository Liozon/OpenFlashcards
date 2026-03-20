FROM maven:3.9.9-eclipse-temurin-8

WORKDIR /home/open.flashcards

COPY pom.xml .
RUN mvn dependency:go-offline

# Build timestamp: 2026-03-20T13:13:25Z
COPY src ./src
RUN mvn package -Dmaven.test.skip=true

EXPOSE 8080

CMD ["java", "-jar", "target/open.flashcards-0.0.1-SNAPSHOT.jar"]
