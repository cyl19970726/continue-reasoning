import { createCodingContext } from '../src/core/contexts/coding';
import path from 'path';

async function simpleCodingTest() {
    console.log('🎯 Simple Coding Test - Direct File Creation\n');
    
    // 创建测试工作空间目录
    const workspacePath = path.join(process.cwd(), 'test-agent');
    
    // 确保测试目录存在
    if (!require('fs').existsSync(workspacePath)) {
        require('fs').mkdirSync(workspacePath, { recursive: true });
        console.log(`📁 Created test workspace: ${workspacePath}`);
    }

    console.log('🔧 Creating coding context...');
    const codingContext = createCodingContext(workspacePath);
    
    // 获取可用的工具
    const toolSet = codingContext.getToolSet();
    console.log(`✅ Available tools: ${toolSet.tools.length} tools loaded`);
    
    // 直接使用 ApplyWholeFileEditTool 创建文件
    const editTool = toolSet.tools.find(tool => tool.name === 'ApplyWholeFileEditTool');
    
    if (!editTool) {
        console.error('❌ ApplyWholeFileEditTool not found!');
        return;
    }
    
    console.log('📝 Creating factorial.py file...');
    
    const pythonContent = `#!/usr/bin/env python3
"""
Factorial Calculator

A simple Python script that calculates the factorial of a number.
Includes proper error handling and input validation.

Author: AI Agent
Date: ${new Date().toISOString().split('T')[0]}
"""

import sys
from typing import Union


def factorial(n: int) -> int:
    """
    Calculate the factorial of a non-negative integer.
    
    Args:
        n (int): A non-negative integer
        
    Returns:
        int: The factorial of n
        
    Raises:
        ValueError: If n is negative
        TypeError: If n is not an integer
    """
    if not isinstance(n, int):
        raise TypeError(f"Input must be an integer, got {type(n).__name__}")
    
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers")
    
    if n == 0 or n == 1:
        return 1
    
    result = 1
    for i in range(2, n + 1):
        result *= i
    
    return result


def get_user_input() -> int:
    """
    Get and validate user input for factorial calculation.
    
    Returns:
        int: A validated non-negative integer
    """
    while True:
        try:
            user_input = input("Enter a non-negative integer: ").strip()
            number = int(user_input)
            
            if number < 0:
                print("Error: Please enter a non-negative integer.")
                continue
                
            return number
            
        except ValueError:
            print("Error: Please enter a valid integer.")
        except KeyboardInterrupt:
            print("\nOperation cancelled by user.")
            sys.exit(0)


def main():
    """Main function to run the factorial calculator."""
    print("=== Factorial Calculator ===")
    print("This program calculates the factorial of a non-negative integer.")
    print("Press Ctrl+C to exit at any time.\n")
    
    try:
        while True:
            number = get_user_input()
            result = factorial(number)
            
            print(f"\n{number}! = {result}")
            print(f"Calculation: {number} factorial = {result:,}")
            
            // Ask if user wants to continue
            while True:
                continue_choice = input("\nCalculate another factorial? (y/n): ").strip().lower()
                if continue_choice in ['y', 'yes']:
                    print()  // Add blank line
                    break
                elif continue_choice in ['n', 'no']:
                    print("Thank you for using the factorial calculator!")
                    return
                else:
                    print("Please enter 'y' for yes or 'n' for no.")
                    
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user. Goodbye!")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
`;

    try {
        // 调用工具创建文件
        const result = await editTool.execute({
            path: "factorial.py",
            content: pythonContent
        }, {} as any);
        
        console.log('✅ File creation result:', result);
        
        // 创建测试文件
        console.log('📝 Creating test file...');
        
        const testContent = `#!/usr/bin/env python3
"""
Test suite for factorial.py

Run with: python -m pytest test_factorial.py -v
Or simply: python test_factorial.py
"""

import unittest
import sys
from io import StringIO
from factorial import factorial


class TestFactorial(unittest.TestCase):
    """Test cases for the factorial function."""
    
    def test_factorial_zero(self):
        """Test factorial of 0."""
        self.assertEqual(factorial(0), 1)
    
    def test_factorial_one(self):
        """Test factorial of 1."""
        self.assertEqual(factorial(1), 1)
    
    def test_factorial_positive_numbers(self):
        """Test factorial of positive numbers."""
        test_cases = [
            (2, 2),
            (3, 6),
            (4, 24),
            (5, 120),
            (6, 720),
            (10, 3628800)
        ]
        
        for input_val, expected in test_cases:
            with self.subTest(input_val=input_val):
                self.assertEqual(factorial(input_val), expected)
    
    def test_factorial_large_number(self):
        """Test factorial of a larger number."""
        // 15! = 1307674368000
        self.assertEqual(factorial(15), 1307674368000)
    
    def test_factorial_negative_number(self):
        """Test that factorial raises ValueError for negative numbers."""
        with self.assertRaises(ValueError):
            factorial(-1)
        
        with self.assertRaises(ValueError):
            factorial(-10)
    
    def test_factorial_non_integer(self):
        """Test that factorial raises TypeError for non-integer input."""
        with self.assertRaises(TypeError):
            factorial(3.14)
        
        with self.assertRaises(TypeError):
            factorial("5")
        
        with self.assertRaises(TypeError):
            factorial([5])
    
    def test_factorial_type_safety(self):
        """Test type safety of factorial function."""
        // Test with boolean (which is a subclass of int in Python)
        self.assertEqual(factorial(True), 1)   // True == 1
        self.assertEqual(factorial(False), 1)  // False == 0


class TestFactorialIntegration(unittest.TestCase):
    """Integration tests for the factorial module."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.original_stdout = sys.stdout
        self.original_stdin = sys.stdin
    
    def tearDown(self):
        """Clean up after tests."""
        sys.stdout = self.original_stdout
        sys.stdin = self.original_stdin
    
    def test_module_import(self):
        """Test that the module can be imported without errors."""
        try:
            import factorial
            self.assertTrue(hasattr(factorial, 'factorial'))
            self.assertTrue(hasattr(factorial, 'main'))
            self.assertTrue(hasattr(factorial, 'get_user_input'))
        except ImportError:
            self.fail("factorial module could not be imported")


def run_performance_test():
    """Simple performance test for factorial calculation."""
    import time
    
    print("\n=== Performance Test ===")
    
    test_values = [100, 500, 1000]
    
    for n in test_values:
        start_time = time.time()
        result = factorial(n)
        end_time = time.time()
        
        print(f"factorial({n}) calculated in {end_time - start_time:.6f} seconds")
        print(f"Result has {len(str(result))} digits")


if __name__ == "__main__":
    print("Running factorial tests...")
    
    // Run unit tests
    unittest.main(argv=[''], exit=False, verbosity=2)
    
    // Run performance test
    run_performance_test()
    
    print("\n✅ All tests completed!")
`;

        const testResult = await editTool.execute({
            path: "test_factorial.py",
            content: testContent
        }, {} as any);
        
        console.log('✅ Test file creation result:', testResult);
        
        // 创建 README 文件
        console.log('📝 Creating README.md...');
        
        const readmeContent = `# Factorial Calculator

A simple Python script that calculates the factorial of a number with proper error handling and documentation.

## Features

- ✅ Calculate factorial of any non-negative integer
- ✅ Input validation and error handling
- ✅ Interactive command-line interface
- ✅ Comprehensive test suite
- ✅ Type hints and documentation
- ✅ Performance testing

## Files

- \`factorial.py\` - Main factorial calculator script
- \`test_factorial.py\` - Test suite for the factorial function
- \`README.md\` - This documentation file

## Usage

### Running the Calculator

\`\`\`bash
python factorial.py
\`\`\`

The script will prompt you to enter a non-negative integer and calculate its factorial.

### Example Session

\`\`\`
=== Factorial Calculator ===
This program calculates the factorial of a non-negative integer.
Press Ctrl+C to exit at any time.

Enter a non-negative integer: 5

5! = 120
Calculation: 5 factorial = 120

Calculate another factorial? (y/n): n
Thank you for using the factorial calculator!
\`\`\`

### Running Tests

Run the test suite:

\`\`\`bash
python test_factorial.py
\`\`\`

Or using pytest (if installed):

\`\`\`bash
python -m pytest test_factorial.py -v
\`\`\`

### Using as a Module

You can also import and use the factorial function in your own code:

\`\`\`python
from factorial import factorial

result = factorial(5)
print(f"5! = {result}")  // Output: 5! = 120
\`\`\`

## Requirements

- Python 3.6 or higher
- No external dependencies for basic functionality
- pytest (optional, for enhanced testing)

## Error Handling

The factorial function includes comprehensive error handling:

- **TypeError**: Raised when input is not an integer
- **ValueError**: Raised when input is negative
- **KeyboardInterrupt**: Gracefully handled during interactive use

## Function Documentation

### \`factorial(n: int) -> int\`

Calculate the factorial of a non-negative integer.

**Parameters:**
- \`n\` (int): A non-negative integer

**Returns:**
- int: The factorial of n (n!)

**Raises:**
- \`ValueError\`: If n is negative
- \`TypeError\`: If n is not an integer

### \`get_user_input() -> int\`

Get and validate user input for factorial calculation.

**Returns:**
- int: A validated non-negative integer

### \`main()\`

Main function to run the interactive factorial calculator.

## Mathematical Background

The factorial of a non-negative integer n, denoted by n!, is the product of all positive integers less than or equal to n:

- 0! = 1 (by definition)
- 1! = 1
- n! = n × (n-1) × (n-2) × ... × 2 × 1

For example:
- 5! = 5 × 4 × 3 × 2 × 1 = 120

## Performance

The implementation uses an iterative approach for efficiency. Performance test results are included in the test suite.

## License

This is a demonstration script created by an AI agent for educational purposes.

## Author

Generated by AI Agent on ${new Date().toISOString().split('T')[0]}
`;

        const readmeResult = await editTool.execute({
            path: "README.md",
            content: readmeContent
        }, {} as any);
        
        console.log('✅ README creation result:', readmeResult);
        
    } catch (error) {
        console.error('❌ Error creating files:', error);
    }
    
    // 检查生成的文件
    console.log('\n📂 Checking generated files:');
    try {
        const fs = require('fs');
        const files = fs.readdirSync(workspacePath);
        if (files.length > 0) {
            console.log(`✅ Successfully created ${files.length} files:`);
            files.forEach((file: string) => {
                const filePath = path.join(workspacePath, file);
                const stats = fs.statSync(filePath);
                console.log(`  📄 ${file} (${stats.size} bytes)`);
            });
        } else {
            console.log('❌ No files found in workspace');
        }
    } catch (error) {
        console.error(`❌ Error checking workspace: ${error}`);
    }
    
    console.log('\n🎉 Simple coding test completed!');
}

// 运行测试
if (require.main === module) {
    simpleCodingTest()
        .then(() => {
            console.log('\n✨ Simple test completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}

export { simpleCodingTest }; 