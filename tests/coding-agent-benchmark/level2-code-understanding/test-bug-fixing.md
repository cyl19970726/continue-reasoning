# Level 2: Bug Fixing and Code Understanding Test

## Test Overview
**Category**: Code Understanding  
**Difficulty**: Intermediate  
**Time Limit**: 60 seconds  
**Success Criteria**: All bugs identified and fixed correctly

## Test Scenario
You've inherited a small JavaScript application that has several bugs. Your task is to identify, understand, and fix these issues while maintaining the original functionality.

## Buggy Code Files

### File 1: `src/calculator.js`
```javascript
class Calculator {
  constructor() {
    this.history = [];
  }

  add(a, b) {
    const result = a + b;
    this.history.push(`${a} + ${b} = ${result}`);
    return result;
  }

  subtract(a, b) {
    const result = a - b;
    this.history.push(`${a} - ${b} = ${result}`);
    return result;
  }

  multiply(a, b) {
    const result = a * b;
    this.history.push(`${a} * ${b} = ${result}`);
    return result;
  }

  divide(a, b) {
    const result = a / b;  // Bug: No division by zero check
    this.history.push(`${a} / ${b} = ${result}`);
    return result;
  }

  getHistory() {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }

  // Bug: Method name typo
  getLastResult() {
    if (this.history.length = 0) {  // Bug: Assignment instead of comparison
      return null;
    }
    const lastEntry = this.history[this.history.length - 1];
    return parseFloat(lastEntry.split(' = ')[1]);
  }
}

module.exports = Calculator;
```

### File 2: `src/userManager.js`
```javascript
class UserManager {
  constructor() {
    this.users = [];
    this.currentId = 1;
  }

  addUser(name, email) {
    // Bug: No input validation
    const user = {
      id: this.currentId++,
      name: name,
      email: email,
      createdAt: new Date()
    };
    this.users.push(user);
    return user;
  }

  findUserById(id) {
    return this.users.find(user => user.id === id);  // Bug: Type mismatch possible
  }

  findUserByEmail(email) {
    return this.users.find(user => user.email === email);
  }

  updateUser(id, updates) {
    const user = this.findUserById(id);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Bug: Direct object mutation without validation
    Object.assign(user, updates);
    return user;
  }

  deleteUser(id) {
    const index = this.users.findIndex(user => user.id === id);
    if (index > -1) {
      this.users.splice(index, 1);
      return true;
    }
    return false;
  }

  getAllUsers() {
    return this.users;  // Bug: Returns reference to internal array
  }

  // Bug: Async function without proper error handling
  async validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = UserManager;
```

### File 3: `src/utils.js`
```javascript
// Bug: Missing function declaration
function formatCurrency(amount, currency = 'USD') {
  if (typeof amount !== 'number') {
    throw new Error('Amount must be a number');
  }
  
  // Bug: Incorrect currency formatting
  return `${currency}${amount.toFixed(2)}`;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);  // Bug: Lost context (this)
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Bug: Infinite recursion potential
function factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);  // Bug: No validation for negative numbers
}

// Bug: Memory leak potential
function createCounter() {
  let count = 0;
  const counters = [];  // Bug: Array grows indefinitely
  
  return function() {
    count++;
    counters.push(count);
    return count;
  };
}

module.exports = {
  formatCurrency,
  debounce,
  factorial,
  createCounter
};
```

## Tasks

### Task 1: Bug Identification (20 points)
Identify all bugs in the provided code files. For each bug:
1. Specify the file and line number
2. Describe the issue
3. Explain the potential impact
4. Categorize the bug type (logic error, type error, security issue, etc.)

### Task 2: Bug Fixing (30 points)
Fix all identified bugs while maintaining the original functionality:
1. Implement proper input validation
2. Handle edge cases appropriately
3. Fix logical errors
4. Ensure type safety
5. Prevent potential security issues

### Task 3: Code Improvement (20 points)
Beyond fixing bugs, improve the code quality:
1. Add proper error handling
2. Improve function documentation
3. Optimize performance where possible
4. Follow JavaScript best practices

### Task 4: Test Cases (15 points)
Create test cases that would have caught these bugs:
1. Unit tests for each function
2. Edge case testing
3. Error condition testing
4. Integration testing scenarios

### Task 5: Documentation (15 points)
Document your changes:
1. List all bugs found and fixed
2. Explain the reasoning behind each fix
3. Provide usage examples for improved functions
4. Add JSDoc comments where appropriate

## Expected Bugs to Find

### Calculator.js
1. Division by zero not handled
2. Assignment operator instead of comparison in `getLastResult`
3. Potential parsing errors in `getLastResult`

### UserManager.js
1. No input validation in `addUser`
2. Type mismatch in `findUserById` (string vs number)
3. Direct object mutation without validation
4. Returns reference to internal array
5. Missing error handling in async function

### Utils.js
1. Incorrect currency formatting
2. Lost context in debounce function
3. No validation for negative numbers in factorial
4. Memory leak in createCounter
5. Missing input validation in multiple functions

## Evaluation Criteria

### Bug Detection (35%)
- Correctly identified all critical bugs
- Understood the impact of each bug
- Proper categorization of bug types

### Fix Quality (35%)
- All bugs properly fixed
- Original functionality preserved
- No new bugs introduced
- Proper error handling implemented

### Code Quality (20%)
- Follows best practices
- Improved readability
- Added appropriate documentation
- Performance considerations

### Testing (10%)
- Comprehensive test coverage
- Edge cases considered
- Proper test structure
- Realistic test scenarios

## Success Indicators
- ✅ All 12+ bugs identified
- ✅ All fixes implemented correctly
- ✅ Code passes all test cases
- ✅ No regression issues introduced
- ✅ Improved code quality and documentation 