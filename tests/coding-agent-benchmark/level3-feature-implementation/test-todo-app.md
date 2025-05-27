# Level 3: Todo Application Implementation Test

## Test Overview
**Category**: Feature Implementation  
**Difficulty**: Intermediate-Advanced  
**Time Limit**: 300 seconds (5 minutes)  
**Success Criteria**: Complete working application with all features

## Test Scenario
Build a complete Todo application from scratch with modern web technologies. The application should include both backend API and frontend interface with full CRUD operations and additional features.

## Requirements

### Core Features (Required)
1. **Task Management**
   - Create new tasks
   - Mark tasks as complete/incomplete
   - Edit task details
   - Delete tasks
   - List all tasks

2. **Task Properties**
   - Title (required)
   - Description (optional)
   - Priority (low, medium, high)
   - Due date (optional)
   - Status (pending, completed)
   - Created/updated timestamps

3. **Data Persistence**
   - Store tasks in JSON file or SQLite database
   - Maintain data between application restarts

### Advanced Features (Bonus)
1. **Categories/Tags**
   - Assign categories to tasks
   - Filter tasks by category
   - Color-coded categories

2. **Search and Filter**
   - Search tasks by title/description
   - Filter by status, priority, due date
   - Sort by different criteria

3. **User Interface**
   - Responsive design
   - Keyboard shortcuts
   - Drag-and-drop reordering

## Technical Specifications

### Backend (Node.js/Express)
```javascript
// Required API endpoints:
GET    /api/tasks           // Get all tasks
POST   /api/tasks           // Create new task
GET    /api/tasks/:id       // Get specific task
PUT    /api/tasks/:id       // Update task
DELETE /api/tasks/:id       // Delete task

// Optional endpoints:
GET    /api/tasks/search?q=query    // Search tasks
GET    /api/categories              // Get all categories
POST   /api/categories              // Create category
```

### Frontend (HTML/CSS/JavaScript)
```html
<!-- Required UI components: -->
- Task input form
- Task list display
- Task item with actions (edit, delete, toggle)
- Filter/search controls
- Priority indicators
- Due date display
```

### Data Model
```javascript
// Task object structure:
{
  id: string,           // Unique identifier
  title: string,        // Task title (required)
  description: string,  // Task description (optional)
  priority: 'low' | 'medium' | 'high',
  status: 'pending' | 'completed',
  dueDate: Date | null,
  category: string | null,
  createdAt: Date,
  updatedAt: Date
}
```

## Implementation Tasks

### Task 1: Project Setup (10 points)
1. Create project structure:
```
todo-app/
├── backend/
│   ├── server.js
│   ├── routes/
│   ├── models/
│   ├── middleware/
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
└── README.md
```

2. Initialize package.json with dependencies
3. Set up basic Express server
4. Create HTML boilerplate

### Task 2: Backend API (40 points)
1. **Server Setup**
   - Express server with CORS
   - JSON body parsing
   - Error handling middleware
   - Port configuration

2. **Data Layer**
   - Task model/schema
   - File-based storage (JSON) or SQLite
   - CRUD operations
   - Data validation

3. **API Routes**
   - Implement all required endpoints
   - Input validation
   - Error responses
   - Status codes

4. **Testing**
   - API endpoint testing
   - Error handling verification

### Task 3: Frontend Interface (30 points)
1. **HTML Structure**
   - Semantic HTML elements
   - Form for task creation
   - Task list container
   - Filter/search controls

2. **CSS Styling**
   - Responsive layout
   - Modern design
   - Priority color coding
   - Status indicators

3. **JavaScript Functionality**
   - API communication
   - DOM manipulation
   - Event handling
   - Form validation

### Task 4: Integration (15 points)
1. **API Integration**
   - Connect frontend to backend
   - Handle API responses
   - Error handling
   - Loading states

2. **User Experience**
   - Smooth interactions
   - Feedback messages
   - Keyboard shortcuts
   - Accessibility features

### Task 5: Testing & Documentation (5 points)
1. **Testing**
   - Manual testing checklist
   - Edge case handling
   - Error scenarios

2. **Documentation**
   - Setup instructions
   - API documentation
   - Usage guide

## Evaluation Criteria

### Functionality (50%)
- All core features working correctly
- API endpoints responding properly
- Frontend-backend integration
- Data persistence working
- Error handling implemented

### Code Quality (25%)
- Clean, readable code
- Proper project structure
- Consistent naming conventions
- Comments and documentation
- No obvious bugs or issues

### User Experience (15%)
- Intuitive interface
- Responsive design
- Smooth interactions
- Proper feedback
- Accessibility considerations

### Technical Implementation (10%)
- Proper use of technologies
- Security considerations
- Performance optimization
- Best practices followed

## Sample Test Cases

### API Testing
```bash
# Create task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test task","priority":"high"}'

# Get all tasks
curl http://localhost:3000/api/tasks

# Update task
curl -X PUT http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'

# Delete task
curl -X DELETE http://localhost:3000/api/tasks/1
```

### Frontend Testing
1. Create multiple tasks with different priorities
2. Mark tasks as complete/incomplete
3. Edit task details
4. Delete tasks
5. Test search functionality
6. Test filter options
7. Verify data persistence after page refresh

## Success Indicators
- ✅ Backend API fully functional
- ✅ Frontend interface complete and responsive
- ✅ All CRUD operations working
- ✅ Data persists between sessions
- ✅ Error handling implemented
- ✅ Clean, maintainable code
- ✅ Documentation provided

## Bonus Points
- Advanced filtering and search
- Drag-and-drop functionality
- Keyboard shortcuts
- Dark/light theme toggle
- Export/import functionality
- Task categories/tags
- Due date notifications
- Task statistics/analytics 