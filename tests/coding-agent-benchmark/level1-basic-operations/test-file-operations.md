# Level 1: Basic File Operations Test

## Test Overview
**Category**: Basic Operations  
**Difficulty**: Beginner  
**Time Limit**: 30 seconds  
**Success Criteria**: All operations complete successfully

## Test Scenario
You are working on a new project and need to set up the basic file structure and perform common file operations.

## Tasks

### Task 1: Project Setup (5 points)
Create the following directory structure:
```
test-project/
├── src/
│   ├── components/
│   ├── utils/
│   └── tests/
├── docs/
├── config/
└── README.md
```

### Task 2: File Creation (10 points)
Create the following files with basic content:

1. **src/utils/helpers.js**
```javascript
// Utility functions for the project
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

2. **config/app.json**
```json
{
  "name": "test-project",
  "version": "1.0.0",
  "environment": "development",
  "features": {
    "logging": true,
    "analytics": false
  }
}
```

3. **README.md**
```markdown
# Test Project

A simple test project for evaluating coding agent capabilities.

## Features
- Basic file operations
- Utility functions
- Configuration management

## Getting Started
1. Clone the repository
2. Install dependencies
3. Run the application
```

### Task 3: File Reading and Analysis (10 points)
1. Read the content of `config/app.json`
2. Extract the project name and version
3. List all features that are enabled
4. Report the current environment setting

### Task 4: File Modification (15 points)
1. Update `config/app.json` to:
   - Change version to "1.1.0"
   - Enable analytics feature
   - Add a new feature "debugging": true

2. Add a new function to `src/utils/helpers.js`:
```javascript
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}
```

3. Update `README.md` to include the new version number

### Task 5: File Organization (10 points)
1. Create a backup of `config/app.json` as `config/app.backup.json`
2. Move `README.md` to `docs/README.md`
3. Create a new `README.md` in the root with just the project title
4. List all files in the project (recursive)

## Expected Output
The agent should:
1. Successfully create all directories and files
2. Correctly read and parse JSON configuration
3. Make accurate modifications to existing files
4. Properly organize files according to instructions
5. Provide clear feedback on each operation

## Evaluation Criteria

### Correctness (40 points)
- All files and directories created correctly
- File contents match specifications exactly
- Modifications applied accurately
- File operations completed successfully

### Efficiency (10 points)
- Minimal number of operations
- Appropriate tool usage
- No unnecessary file reads/writes

## Common Pitfalls
- Forgetting to create parent directories
- Incorrect JSON syntax after modifications
- File path errors (absolute vs relative)
- Not handling file encoding properly

## Success Indicators
- ✅ All 5 tasks completed
- ✅ No syntax errors in generated files
- ✅ Correct file structure maintained
- ✅ All file operations logged properly 