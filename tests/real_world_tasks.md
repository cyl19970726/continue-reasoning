# HHH-AGI Real-World Task Tests

This document contains practical, real-world tasks to evaluate the agent's effectiveness in solving actual problems that users might present. While the prompt architecture tests focus on internal mechanisms, these tests focus on end-to-end user value.

## Task Categories

### 1. Software Development Tasks

**Task 1.1: Full-Stack Application Setup**
- **Input**: "I need to set up a modern React frontend with a Node.js backend using Express. The app should have user authentication and store data in MongoDB. Help me design and implement this."
- **Expected Flow**:
  1. Create a comprehensive plan with all required steps
  2. Set up the backend first with user authentication
  3. Create the database connection and models
  4. Implement the frontend with React
  5. Connect frontend to backend
- **Success Criteria**: Complete working application structure with proper separation of concerns, authentication flow, and data persistence.

**Task 1.2: Debugging a Complex Issue**
- **Input**: "My Node.js application keeps crashing with this error: `Error: EADDRINUSE: address already in use :::3000`. Help me debug and fix it."
- **Expected Flow**:
  1. Analyze the error and explain its meaning
  2. Suggest immediate fixes (finding and killing the process using the port)
  3. Propose preventative measures (using different ports, proper process management)
  4. Provide bash commands to identify and resolve the issue
- **Success Criteria**: Clear debugging steps, working commands to fix the issue, and prevention advice.

**Task 1.3: Code Refactoring**
- **Input**: "Here's my Python function that's too complex and slow: [provide a complex, inefficient function]. Please refactor it to be more efficient and readable."
- **Expected Flow**:
  1. Analyze the provided code for inefficiencies
  2. Create a plan for refactoring
  3. Implement the improved version
  4. Explain the improvements and their impact
- **Success Criteria**: Significantly improved code that maintains the original functionality while being more efficient and readable.

### 2. Data Analysis and Integration Tasks

**Task 2.1: Data Analysis Pipeline**
- **Input**: "I have CSV data from my company's sales. Help me analyze it to find trends and create visualizations."
- **Expected Flow**:
  1. Request clarification about the data structure
  2. Suggest appropriate tools and libraries
  3. Create code for data cleaning and analysis
  4. Provide visualization code
  5. Explain insights from the data
- **Success Criteria**: Complete data processing pipeline with clear explanations of findings.

**Task 2.2: API Integration**
- **Input**: "I need to integrate the OpenWeatherMap API into my application to display weather forecasts for user-selected cities."
- **Expected Flow**:
  1. Research the OpenWeatherMap API
  2. Create a plan for integration
  3. Implement the API client code
  4. Show how to handle errors and rate limits
  5. Demonstrate data display
- **Success Criteria**: Working integration code with proper error handling and data presentation.

**Task 2.3: Automated Reporting System**
- **Input**: "Create a system that pulls data from a database, generates a PDF report, and emails it to stakeholders weekly."
- **Expected Flow**:
  1. Design the overall architecture
  2. Implement database query code
  3. Create PDF generation functionality
  4. Set up email sending capability
  5. Establish scheduling mechanism
- **Success Criteria**: Complete working system with all components properly integrated.

### 3. DevOps and Infrastructure Tasks

**Task 3.1: Docker Containerization**
- **Input**: "Help me containerize my Node.js application using Docker and set up a docker-compose file for development."
- **Expected Flow**:
  1. Create appropriate Dockerfile
  2. Develop docker-compose.yml for local development
  3. Include necessary services (database, etc.)
  4. Explain how to build and run the containers
  5. Address volume mounting and port mapping
- **Success Criteria**: Working Docker configuration that properly containerizes the application.

**Task 3.2: CI/CD Pipeline Setup**
- **Input**: "I need to set up a CI/CD pipeline for my GitHub repository using GitHub Actions."
- **Expected Flow**:
  1. Design appropriate workflow stages
  2. Create GitHub Actions workflow files
  3. Configure testing, building, and deployment
  4. Explain security considerations
  5. Provide monitoring recommendations
- **Success Criteria**: Complete CI/CD configuration with all necessary stages.

**Task 3.3: Server Performance Optimization**
- **Input**: "My Linux server is running slowly. Help me diagnose and fix performance issues."
- **Expected Flow**:
  1. Provide diagnostic commands to identify bottlenecks
  2. Analyze results and identify likely causes
  3. Suggest specific optimizations
  4. Create a plan for implementing fixes
  5. Recommend monitoring solutions
- **Success Criteria**: Comprehensive diagnostic approach with specific, actionable optimization steps.

### 4. AI and Machine Learning Tasks

**Task 4.1: ML Model Deployment**
- **Input**: "I've trained a machine learning model in Python. Help me deploy it as an API that can be called from a web application."
- **Expected Flow**:
  1. Recommend appropriate deployment architecture
  2. Create code for serving the model via API
  3. Implement request handling and preprocessing
  4. Address scaling and performance concerns
  5. Suggest monitoring and updating strategies
- **Success Criteria**: Complete deployment solution with proper API design and performance considerations.

**Task 4.2: NLP Pipeline**
- **Input**: "I need to analyze customer reviews to extract sentiment and key topics. Help me build an NLP pipeline."
- **Expected Flow**:
  1. Recommend appropriate NLP tools and libraries
  2. Design the processing pipeline
  3. Implement text preprocessing
  4. Create sentiment analysis functionality
  5. Develop topic extraction capabilities
- **Success Criteria**: Working NLP pipeline that effectively extracts insights from text data.

**Task 4.3: Vision AI Integration**
- **Input**: "I want to add image recognition to my app to identify objects in user-uploaded photos."
- **Expected Flow**:
  1. Research suitable vision AI services or models
  2. Compare options based on requirements
  3. Implement integration with chosen solution
  4. Handle image preprocessing and result parsing
  5. Address performance and error handling
- **Success Criteria**: Complete integration solution with proper image handling and result processing.

### 5. Complex Business Logic Tasks

**Task 5.1: E-commerce Pricing Engine**
- **Input**: "I need to create a dynamic pricing engine for my e-commerce site that adjusts prices based on demand, competitor prices, and inventory levels."
- **Expected Flow**:
  1. Design the pricing algorithm architecture
  2. Define required data inputs and sources
  3. Implement core pricing logic
  4. Create adjustment mechanisms
  5. Design monitoring and control systems
- **Success Criteria**: Complete pricing engine with flexible rules and proper data integration.

**Task 5.2: Permission System**
- **Input**: "Design a role-based access control system for my multi-tenant SaaS application."
- **Expected Flow**:
  1. Analyze requirements and constraints
  2. Design the permission model and hierarchy
  3. Create database schema
  4. Implement core permission logic
  5. Design API for permission management
- **Success Criteria**: Comprehensive permission system that handles complex access control scenarios.

**Task 5.3: Financial Calculation Engine**
- **Input**: "I need to create a mortgage calculator that handles various loan types, interest rates, and payment schedules."
- **Expected Flow**:
  1. Research different mortgage calculation formulas
  2. Design the calculator architecture
  3. Implement calculation logic for different scenarios
  4. Create visualization components
  5. Add sensitivity analysis capabilities
- **Success Criteria**: Accurate, comprehensive calculation engine handling all required scenarios.

## Evaluation Framework

For each task, assess:

1. **Problem Understanding**: Did the agent correctly understand the requirements?
2. **Solution Completeness**: Did the solution address all aspects of the problem?
3. **Technical Accuracy**: Was the technical implementation correct and appropriate?
4. **Best Practices**: Did the solution follow industry best practices?
5. **Clarity**: Were explanations and instructions clear and understandable?
6. **Adaptability**: How well did the agent respond to follow-up questions or clarifications?

## Results Recording

For each task, record:

```
### Task X.X: [Name]

**Input**: [Actual task description provided]
**Clarifications Requested**: [Any clarifying questions the agent asked]
**Solution Approach**: [Summary of the agent's approach]
**Key Components Delivered**: [List of specific components/code/explanations provided]

**Evaluation**:
- Problem Understanding: [1-5 rating] - [Notes]
- Solution Completeness: [1-5 rating] - [Notes]
- Technical Accuracy: [1-5 rating] - [Notes]
- Best Practices: [1-5 rating] - [Notes]
- Clarity: [1-5 rating] - [Notes]
- Adaptability: [1-5 rating] - [Notes]

**Overall Score**: [Average of ratings]
**Strengths**:
- [Key strengths observed]

**Weaknesses**:
- [Areas for improvement]

**User Effort Required**:
- [What the user would still need to do themselves]
```

## Comparative Analysis

After completing these tests, perform a comparative analysis:

1. Which types of tasks does the agent excel at?
2. Which types of tasks are most challenging?
3. How does performance vary across different complexity levels?
4. What patterns exist in the agent's approach to problem-solving?
5. How much does the quality of the initial request affect the results?

This analysis will help identify areas for targeted improvement in the agent's capabilities, prompt engineering, and context design. 