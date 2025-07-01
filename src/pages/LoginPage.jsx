import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updatePassword
} from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    addDoc,
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    arrayUnion,
    arrayRemove,
    onSnapshot,
    deleteDoc,
    Timestamp
} from 'firebase/firestore';

// Import Lucide React icons for a modern look and feel
import { Home, School, BookOpen, Users, GraduationCap, User, Menu, X, MoreVertical, Search, LogOut, ChevronLeft, ChevronRight, Edit, Trash2, Download } from 'lucide-react';


// --- UTILS ---

// Firebase Configuration with your provided credentials
const firebaseConfig = {
  apiKey: "AIzaSyAwzXvo1MhL8Uj9UlhhMu4_LPB013SW2ig",
  authDomain: "srcs-log-book.firebaseapp.com",
  projectId: "srcs-log-book",
  storageBucket: "srcs-log-book.firebasestorage.app",
  messagingSenderId: "1016390403599",
  appId: "1:1016390403599:web:303b35a99b0f2260a2057a",
  measurementId: "G-P7ZZ5VVJ88"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// A sorted list of course categories for consistency across the app
const COURSE_CATEGORIES = [
    "Applied Subjects (SHS) Learner's Content",
    "Applied Subjects (SHS) Teacher's Content",
    "Junior High School (Learner's Content)",
    "Junior High School (MATATAG) Learner's Content",
    "Junior High School (MATATAG) Teacher's Content",
    "Junior High School (Teacher's Content)",
    "School-based Subjects",
    "Senior High School (Learner's Content)",
    "Senior High School (Teacher's Content)",
    "Specialized Subjects (HUMSS)",
    "Specialized Subjects (STEM)"
].sort();


// --- SERVICES ---

// Centralized Firestore Service to interact with the database
const firestoreService = {
    getUserProfile: async (uid) => {
        const userDocRef = doc(db, "users", uid);
        const userDoc = await getDoc(userDocRef);
        return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
    },
    createUserProfile: (uid, email, role, firstName, lastName) => setDoc(doc(db, "users", uid), { email, role, firstName, lastName, gender: 'Not specified' }),
    updateUserProfile: (uid, profileData) => updateDoc(doc(db, "users", uid), profileData),
    createClass: async (teacherId, className, gradeLevel) => {
        const classCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const classRef = await addDoc(collection(db, "classes"), { name: className, teacherId, students: [], code: classCode, gradeLevel, courseAccess: {} });
        return { id: classRef.id, code: classCode };
    },
    editClassName: (classId, newName) => updateDoc(doc(db, "classes", classId), { name: newName }),
    deleteClass: (classId) => deleteDoc(doc(db, "classes", classId)),
    removeStudentFromClass: (classId, studentId) => updateDoc(doc(db, "classes", classId), { students: arrayRemove(studentId) }),
    createCourse: async (teacherId, courseTitle, category) => {
        const courseRef = await addDoc(collection(db, "courses"), { title: courseTitle, category, teacherId, units: [] });
        return courseRef.id;
    },
    editCourse: (courseId, newTitle, newCategory) => updateDoc(doc(db, "courses", courseId), { title: newTitle, category: newCategory }),
    addUnitToCourse: async (courseId, unitTitle) => {
        const unit = { id: `unit_${Date.now()}`, title: unitTitle, lessons: [] };
        await updateDoc(doc(db, "courses", courseId), { units: arrayUnion(unit) });
        return unit.id;
    },
    editUnitTitle: async (courseId, unitId, newTitle) => {
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) throw new Error("Course not found");
        const courseData = courseSnap.data();
        const updatedUnits = courseData.units.map(unit => unit.id === unitId ? { ...unit, title: newTitle } : unit);
        await updateDoc(courseRef, { units: updatedUnits });
    },
    addLessonToUnit: async (courseId, unitId, lessonData) => {
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) throw new Error("Course not found");
        const courseData = courseSnap.data();
        const units = courseData.units || [];
        const unitIndex = units.findIndex(u => u.id === unitId);
        if (unitIndex === -1) throw new Error("Unit not found");
        const newLesson = { id: `lesson_${Date.now()}`, title: lessonData.title, studyGuideUrl: lessonData.studyGuideUrl || '', pages: lessonData.pages || [], quizzes: [] };
        units[unitIndex].lessons.push(newLesson);
        await updateDoc(courseRef, { units });
        return newLesson.id;
    },
    editLesson: async (courseId, unitId, lessonId, newLessonData) => {
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) throw new Error("Course not found");
        const courseData = courseSnap.data();
        const updatedUnits = courseData.units.map(unit => {
            if (unit.id === unitId) {
                const updatedLessons = unit.lessons.map(lesson => lesson.id === lessonId ? { ...lesson, ...newLessonData } : lesson);
                return { ...unit, lessons: updatedLessons };
            }
            return unit;
        });
        await updateDoc(courseRef, { units: updatedUnits });
    },
    deleteLesson: async (courseId, unitId, lessonId) => {
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) throw new Error("Course not found");
        const courseData = courseSnap.data();
        const updatedUnits = courseData.units.map(unit => {
            if (unit.id === unitId) {
                return { ...unit, lessons: unit.lessons.filter(l => l.id !== lessonId) };
            }
            return unit;
        });
        await updateDoc(courseRef, { units: updatedUnits });
    },
    updateCourseAccess: async (classId, courseId, contentToShare, availableFrom, availableUntil) => {
        const classRef = doc(db, "classes", classId);
        const updates = {};
        for (const lessonId in contentToShare) {
            const { unitId } = contentToShare[lessonId];
            const path = `courseAccess.${courseId}.units.${unitId}.lessons.${lessonId}`;
            updates[`${path}.sharePages`] = true;
            updates[`${path}.quizzes`] = (await firestoreService.getLessonQuizzes(courseId, unitId, lessonId)).map(q => q.id);
            updates[`${path}.availableFrom`] = Timestamp.fromDate(new Date(availableFrom));
            updates[`${path}.availableUntil`] = Timestamp.fromDate(new Date(availableUntil));
        }
        await updateDoc(classRef, updates);
    },
    getLessonQuizzes: async (courseId, unitId, lessonId) => {
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) return [];
        const unit = courseSnap.data().units.find(u => u.id === unitId);
        if (!unit) return [];
        const lesson = unit.lessons.find(l => l.id === lessonId);
        return lesson?.quizzes || [];
    },
    addQuizToLesson: async (courseId, unitId, lessonId, quizData) => {
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) throw new Error("Course not found");
        const courseData = courseSnap.data();
        const units = courseData.units || [];
        const unitIndex = units.findIndex(u => u.id === unitId);
        if (unitIndex === -1) throw new Error("Unit not found");
        const lessonIndex = units[unitIndex].lessons.findIndex(l => l.id === lessonId);
        if (lessonIndex === -1) throw new Error("Lesson not found");
        const newQuiz = { id: `quiz_${Date.now()}`, title: quizData.title, questions: quizData.questions };
        units[unitIndex].lessons[lessonIndex].quizzes = units[unitIndex].lessons[lessonIndex].quizzes || [];
        units[unitIndex].lessons[lessonIndex].quizzes.push(newQuiz);
        await updateDoc(courseRef, { units });
        return newQuiz.id;
    },
    editQuiz: async (courseId, unitId, lessonId, quizId, newQuizData) => {
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);
        if (!courseSnap.exists()) throw new Error("Course not found");
        const courseData = courseSnap.data();
        const updatedUnits = courseData.units.map(unit => {
            if (unit.id === unitId) {
                const updatedLessons = unit.lessons.map(lesson => {
                    if (lesson.id === lessonId) {
                        const updatedQuizzes = lesson.quizzes.map(quiz => quiz.id === quizId ? { ...quiz, ...newQuizData } : quiz);
                        return { ...lesson, quizzes: updatedQuizzes };
                    }
                    return lesson;
                });
                return { ...unit, lessons: updatedLessons };
            }
            return unit;
        });
        await updateDoc(courseRef, { units: updatedUnits });
    },
    joinClass: async (studentId, classCode) => {
        const q = query(collection(db, "classes"), where("code", "==", classCode));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) throw new Error("Invalid class code");
        const classDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, "classes", classDoc.id), { students: arrayUnion(studentId) });
        return classDoc.id;
    },
    submitQuiz: async (studentId, courseId, quizId, answers, isLate) => {
        if (!courseId) throw new Error("Course ID is missing.");
        const submissionsQuery = query(collection(db, "submissions"), where("studentId", "==", studentId), where("quizId", "==", quizId));
        const priorSubmissions = await getDocs(submissionsQuery);
        if (priorSubmissions.size >= 3) throw new Error("You have already reached the maximum of 3 attempts for this quiz.");
        const courseSnap = await getDoc(doc(db, "courses", courseId));
        if (!courseSnap.exists()) throw new Error("Course data could not be found for this quiz.");
        let quiz;
        courseSnap.data().units.forEach(unit => unit.lessons.forEach(lesson => {
            const foundQuiz = lesson.quizzes.find(q => q.id === quizId);
            if (foundQuiz) quiz = foundQuiz;
        }));
        if (!quiz) throw new Error("Quiz not found");
        let score = 0;
        quiz.questions.forEach((q, index) => {
            if (q.correctOption === answers[index]) score++;
        });
        const totalQuestions = quiz.questions.length;
        const percentage = (score / totalQuestions) * 100;
        const submissionRef = await addDoc(collection(db, "submissions"), { 
            studentId, 
            courseId, 
            quizId, 
            answers, 
            score, 
            totalQuestions, 
            percentage, 
            submittedAt: new Date(),
            submissionType: isLate ? 'late' : 'on-time'
        });
        return { id: submissionRef.id, score, totalQuestions, percentage };
    },
    recordLessonView: async (studentId, classId, courseId, lessonId) => {
        const recordId = `${studentId}_${lessonId}`;
        const recordRef = doc(db, "viewRecords", recordId);
        const recordSnap = await getDoc(recordRef);
        if (!recordSnap.exists()) {
            await setDoc(recordRef, { studentId, classId, courseId, lessonId, viewedAt: new Date() });
        }
    },
    getAllStudents: async () => {
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
};

// --- CONTEXT ---
const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Initial user credentials (in a real app, this would be managed securely on the backend)
    const [users, setUsers] = useState(() => {
        const initialUsers = { 
            "srcsteach01@srcs.edu": "srcs2025", 
            "srcslearn01@srcs.edu": "srcs2025", 
            "admin001@srcs.edu": "adminsrcs",
            "srcslearn02@srcs.edu": "srcs2025",
            "srcslearn03@srcs.edu": "srcs2025",
            "srcslearn04@srcs.edu": "srcs2025",
            "srcslearn05@srcs.edu": "srcs2025",
        };
        for (let i = 2; i <= 35; i++) {
            initialUsers[`srcsteach${i.toString().padStart(2, '0')}@srcs.edu`] = "srcs2025";
        }
        return initialUsers;
    });
    
    // User role assignments
    const userRoles = (() => {
        const roles = { 
            "srcsteach01@srcs.edu": "teacher", 
            "srcslearn01@srcs.edu": "student", 
            "admin001@srcs.edu": "admin",
            "srcslearn02@srcs.edu": "student",
            "srcslearn03@srcs.edu": "student",
            "srcslearn04@srcs.edu": "student",
            "srcslearn05@srcs.edu": "student",
        };
        for (let i = 2; i <= 35; i++) {
            roles[`srcsteach${i.toString().padStart(2, '0')}@srcs.edu`] = "teacher";
        }
        return roles;
    })();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const profile = await firestoreService.getUserProfile(firebaseUser.uid);
                setUser(firebaseUser);
                setUserProfile(profile);
            } else {
                setUser(null);
                setUserProfile(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const login = async (email, password, selectedRole) => {
        const designatedRole = userRoles[email];
        if (!users[email] || users[email] !== password) throw new Error("Invalid credentials.");
        if (selectedRole === 'teacher' && designatedRole === 'admin') { /* Allow admin login via teacher page */ }
        else if(designatedRole !== selectedRole) throw new Error(`You are not registered as a ${selectedRole}.`);
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        let profile = await firestoreService.getUserProfile(user.uid);
        if(!profile){
            const nameParts = user.email.split('@')[0].replace(/\d+/g, ' ').trim().split(' ');
            const firstName = nameParts[0] || 'New';
            const lastName = nameParts.slice(1).join(' ') || 'User';
            await firestoreService.createUserProfile(user.uid, user.email, designatedRole, firstName, lastName);
            profile = await firestoreService.getUserProfile(user.uid);
        }
        setUserProfile(profile);
        setUser(user);
    };

    const logout = async () => {
        await signOut(auth);
        setUser(null);
        setUserProfile(null);
    };
    
    const refreshUserProfile = async () => {
        if (user) {
            const profile = await firestoreService.getUserProfile(user.uid);
            setUserProfile(profile);
        }
    }
    
    // Note: In a real app, password updates for other users should be a privileged admin action.
    const updateStudentPassword = (email, newPassword) => {
        setUsers(prevUsers => ({...prevUsers, [email]: newPassword }));
        console.log(`Password for ${email} updated to ${newPassword} (SIMULATED)`);
    }

    const value = { user, userProfile, loading, login, logout, refreshUserProfile, updateStudentPassword };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

// --- SHARED COMPONENTS ---

const useScript = (url, cssUrl) => {
    const [isLoaded, setIsLoaded] = useState(!!window.Quill);
    useEffect(() => {
        if (window.Quill) {
            setIsLoaded(true);
            return;
        }
        let script = document.querySelector(`script[src="${url}"]`);
        let link = document.querySelector(`link[href="${cssUrl}"]`);
        const handleScriptLoad = () => { if (window.Quill) setIsLoaded(true); };
        if (!script) {
            script = document.createElement('script');
            script.src = url;
            script.async = true;
            document.body.appendChild(script);
            script.addEventListener('load', handleScriptLoad);
        } else if (window.Quill) {
            handleScriptLoad();
        }
        if (cssUrl && !link) {
            link = document.createElement('link');
            link.rel = "stylesheet";
            link.href = cssUrl;
            document.head.appendChild(link);
        }
        return () => { if(script) script.removeEventListener('load', handleScriptLoad); };
    }, [url, cssUrl]);
    return isLoaded;
};

const RichTextEditor = ({ value, onChange }) => {
    const quillLoaded = useScript("https://cdn.jsdelivr.net/npm/quill@2.0.0/dist/quill.js", "https://cdn.jsdelivr.net/npm/quill@2.0.0/dist/quill.snow.css");
    const quillRef = useRef(null);
    const editorRef = useRef(null);
    
    useEffect(() => {
        if (!quillLoaded || !editorRef.current) return;
        if (!quillRef.current) {
            quillRef.current = new window.Quill(editorRef.current, {
                theme: 'snow',
                modules: { toolbar: [[{ 'header': [1, 2, false] }], ['bold', 'italic', 'underline', 'link'], [{ 'list': 'ordered' }, { 'list': 'bullet' }]] }
            });
            quillRef.current.on('text-change', () => onChange(quillRef.current.root.innerHTML));
        }
        if (quillRef.current.root.innerHTML !== value) {
            quillRef.current.root.innerHTML = value;
        }
    }, [quillLoaded, value, onChange]);
    
    if (!quillLoaded) return <textarea className="w-full p-2 border rounded" rows="4" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Loading editor..." />;
    return <div ref={editorRef} style={{minHeight: '150px'}} className="bg-white"></div>;
};

const Spinner = () => (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-600"></div>
    </div>
);

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
    if (!isOpen) return null;
    const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '4xl': 'max-w-4xl', '6xl': 'max-w-6xl' };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex justify-center items-center p-4 transition-opacity duration-300">
            <div className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} flex flex-col`}>
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl p-1 rounded-full hover:bg-gray-200 transition-colors">&times;</button>
                </div>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const ToastContext = createContext();
export const useToast = () => useContext(ToastContext);
export const ToastProvider = ({ children }) => {
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };
    const toastBgColor = toast?.type === 'success' ? 'bg-green-500' : 'bg-red-500';
    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {toast && <div className={`fixed bottom-5 right-5 p-4 rounded-lg text-white shadow-lg z-[200] transition-opacity duration-300 ${toastBgColor}`}>{toast.message}</div>}
        </ToastContext.Provider>
    );
};

const UserInitialsAvatar = ({ firstName, lastName, size = 'md' }) => {
    const getInitials = (fName, lName) => `${fName ? fName.charAt(0).toUpperCase() : ''}${lName ? lName.charAt(0).toUpperCase() : ''}`;
    const initials = getInitials(firstName, lastName);
    const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-lg', lg: 'w-12 h-12 text-xl' };
    return <div className={`flex items-center justify-center rounded-full font-bold bg-blue-200 text-blue-800 ${sizeClasses[size]} flex-shrink-0`}>{initials}</div>;
};

// --- PAGES & AUTH ---

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('student');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await login(`${email}@srcs.edu`, password, role);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-md">
                <img src="https://i.ibb.co/XfJ8scGX/1.png" alt="SRCS Logo" className="w-24 h-24 mx-auto mb-4 rounded-full" />
                <h1 className="text-2xl md:text-3xl font-bold text-center text-blue-600 mb-2">SRCS Learning Portal</h1>
                <p className="text-center text-gray-500 mb-6">Welcome back!</p>
                {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">Username</label>
                        <div className="flex items-center border rounded">
                            <input className="appearance-none w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none" id="username" type="text" placeholder="e.g., srcslearn01" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            <span className="bg-gray-200 p-2 text-gray-600">@srcs.edu</span>
                        </div>
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">Password</label>
                        <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-bold mb-2">Role</label>
                        <div className="flex">
                            <button type="button" onClick={() => setRole('student')} className={`flex-1 py-2 px-4 rounded-l-lg transition-colors ${role === 'student' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Student</button>
                            <button type="button" onClick={() => setRole('teacher')} className={`flex-1 py-2 px-4 rounded-r-lg transition-colors ${role === 'teacher' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Teacher</button>
                        </div>
                    </div>
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors" type="submit">Login</button>
                </form>
            </div>
        </div>
    );
};

// --- TEACHER DASHBOARD COMPONENTS ---

const CreateClassPost = ({ teacherId, onClassCreated }) => {
    const [className, setClassName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if(!className.trim()) return;
        setIsSubmitting(true);
        try {
            const newClass = await firestoreService.createClass(teacherId, className, "Grade Level"); // Added default grade level
            showToast(`Class "${className}" created! Code: ${newClass.code}`);
            setClassName('');
            if (onClassCreated) onClassCreated();
        } catch (error) {
            console.error("Error creating class:", error);
            showToast("Failed to create class.", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex items-center mb-3">
                <Users className="text-blue-500 mr-3" size={24} />
                <span className="font-semibold text-gray-700">Create New Class</span>
            </div>
            <form onSubmit={handleSubmit}>
                <textarea value={className} onChange={(e) => setClassName(e.target.value)} placeholder="What class do you want to create?" className="w-full p-2 border-b border-gray-300 focus:outline-none focus:border-blue-500 mb-3 resize-none rounded-md" rows="2" required />
                <button type="submit" disabled={isSubmitting} className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-blue-300">
                    {isSubmitting ? 'Creating...' : 'Create Class'}
                </button>
            </form>
        </div>
    );
};

const CreateCoursePost = ({ teacherId, onCourseCreated }) => {
    const [courseTitle, setCourseTitle] = useState('');
    const [category, setCategory] = useState(COURSE_CATEGORIES[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if(!courseTitle.trim()) return;
        setIsSubmitting(true);
        try {
            await firestoreService.createCourse(teacherId, courseTitle, category);
            showToast(`Subject "${courseTitle}" created successfully!`);
            setCourseTitle('');
            if (onCourseCreated) onCourseCreated();
        } catch (error) {
            console.error("Error creating course:", error);
            showToast("Failed to create course.", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex items-center mb-3">
                <GraduationCap className="text-green-500 mr-3" size={24} />
                <span className="font-semibold text-gray-700">Create New Subject</span>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
                <input type="text" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Subject Title (e.g., Algebra I)" className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500" required />
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:border-blue-500">
                    {COURSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <button type="submit" disabled={isSubmitting} className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-green-300">
                    {isSubmitting ? 'Creating...' : 'Create Subject'}
                </button>
            </form>
        </div>
    );
};

const ClassCard = ({ classData, onClick, onEdit, onDelete }) => {
    return (
        <div className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow duration-200 relative group" onClick={() => onClick(classData)}>
            <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={onEdit} className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200" title="Edit Class Name">
                    <Edit size={16} />
                </button>
                <button onClick={onDelete} className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200" title="Delete Class">
                    <X size={16} />
                </button>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2 pr-12 truncate">{classData.name}</h3>
            <p className="text-sm text-gray-600">Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded-md text-blue-700">{classData.code}</span></p>
            <p className="text-sm text-gray-500 mt-1">Students: {classData.students.length}</p>
        </div>
    );
};

const CourseCategoryCard = ({ category, courseCount, onClick }) => (
    <div className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow duration-200 flex flex-col justify-between" onClick={() => onClick(category)}>
        <h3 className="text-md font-semibold text-gray-800 mb-2">{category}</h3>
        <p className="text-sm text-gray-500">{courseCount} subjects</p>
    </div>
);

const DeleteLessonModal = ({ isOpen, onClose, onConfirm }) => {
    const [authCode, setAuthCode] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onConfirm(authCode);
        setAuthCode('');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Confirm Lesson Deletion">
            <form onSubmit={handleSubmit}>
                <p className="mb-4 text-gray-700">
                    Are you sure you want to delete this lesson? This action cannot be undone.
                    Please enter the authentication code to proceed.
                </p>
                <input
                    type="password"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="Authentication Code"
                    className="w-full p-3 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                />
                <button type="submit" className="w-full bg-red-600 text-white p-3 rounded-md hover:bg-red-700 transition-colors">
                    Confirm Delete
                </button>
            </form>
        </Modal>
    );
};

const TeacherCourseView = ({ course, classes, onCourseUpdated }) => {
    const [isUnitModalOpen, setUnitModalOpen] = useState(false);
    const [isLessonModalOpen, setLessonModalOpen] = useState(false);
    const [isEditLessonModalOpen, setEditLessonModalOpen] = useState(false);
    const [isShareModalOpen, setShareModalOpen] = useState(false);
    const [isLessonDetailOpen, setLessonDetailOpen] = useState(false);
    const [isEditUnitModalOpen, setEditUnitModalOpen] = useState(false);
    const [isDeleteLessonModalOpen, setDeleteLessonModalOpen] = useState(false);
    const [lessonToDelete, setLessonToDelete] = useState(null);
    const [unitToEdit, setUnitToEdit] = useState(null);
    const [collapsedUnits, setCollapsedUnits] = useState({});
    
    const [lessonToEdit, setLessonToEdit] = useState(null);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [selectedLessonForDetail, setSelectedLessonForDetail] = useState(null);
    const { showToast } = useToast();

    const toggleUnit = (unitId) => {
        setCollapsedUnits(prev => ({...prev, [unitId]: !prev[unitId]}));
    }

    const handleAddUnit = async (unitTitle) => {
        try {
            await firestoreService.addUnitToCourse(course.id, unitTitle);
            onCourseUpdated();
            setUnitModalOpen(false);
            showToast("Unit added successfully!");
        } catch (error) {
            console.error("Error adding unit:", error);
            showToast("Failed to add unit.", 'error');
        }
    };

    const handleEditUnit = async (newTitle) => {
        if (!unitToEdit) return;
        try {
            await firestoreService.editUnitTitle(course.id, unitToEdit.id, newTitle);
            onCourseUpdated();
            setEditUnitModalOpen(false);
            showToast("Unit updated successfully!");
        } catch (error) {
            console.error("Error editing unit:", error);
            showToast("Failed to edit unit.", "error");
        }
    }
    
    const handleAddLesson = async (lessonData) => {
        try {
            await firestoreService.addLessonToUnit(course.id, selectedUnit.id, lessonData);
            onCourseUpdated();
            setLessonModalOpen(false);
            showToast("Lesson added successfully!");
        } catch (error) {
            console.error("Error adding lesson:", error);
            showToast("Failed to add lesson.", 'error');
        }
    };
    
    const handleEditLesson = async (newLessonData) => {
        if (!lessonToEdit) return;
        try {
            await firestoreService.editLesson(course.id, lessonToEdit.unitId, lessonToEdit.id, newLessonData);
            onCourseUpdated();
            setEditLessonModalOpen(false);
            setLessonDetailOpen(false);
            showToast("Lesson updated successfully!");
        } catch (error) {
            console.error("Error editing lesson:", error);
            showToast("Failed to edit lesson.", 'error');
        }
    };

    const handleOpenDeleteModal = (e, lesson, unitId) => {
        e.stopPropagation();
        setLessonToDelete({ ...lesson, unitId });
        setDeleteLessonModalOpen(true);
    };

    const handleConfirmDeleteLesson = async (authCode) => {
        if (authCode !== 'admin2025') {
            showToast("Incorrect authentication code.", 'error');
            return;
        }
        if (!lessonToDelete) return;

        try {
            await firestoreService.deleteLesson(course.id, lessonToDelete.unitId, lessonToDelete.id);
            showToast("Lesson deleted successfully!");
            setDeleteLessonModalOpen(false);
            setLessonToDelete(null);
            onCourseUpdated();
        } catch (error) {
            console.error("Error deleting lesson:", error);
            showToast("Failed to delete lesson.", 'error');
        }
    };

    const handleOpenLessonDetail = (lesson, unitId) => {
        setSelectedLessonForDetail({ ...lesson, unitId, courseId: course.id });
        setLessonDetailOpen(true);
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">{course.title}</h2>
                <div className="flex space-x-2">
                    <button onClick={() => setShareModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm">
                        Share Content
                    </button>
                    <button onClick={() => setUnitModalOpen(true)} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors text-sm">
                        Add Unit
                    </button>
                </div>
            </div>
            
            <div className="space-y-4">
                {course.units?.length > 0 ? course.units.map(unit => (
                    <div key={unit.id} className="border border-gray-200 rounded-lg bg-gray-50 p-4">
                        <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleUnit(unit.id)}>
                            <h4 className="font-semibold text-lg text-gray-700">{unit.title}</h4>
                            <div className="flex items-center space-x-2">
                                <button onClick={(e) => { e.stopPropagation(); setUnitToEdit(unit); setEditUnitModalOpen(true)}} className="text-xs bg-gray-300 text-gray-700 px-2 py-1 rounded-md hover:bg-gray-400 transition-colors">Edit</button>
                                <span className="text-gray-500">{collapsedUnits[unit.id] ? '►' : '▼'}</span>
                            </div>
                        </div>
                        {!collapsedUnits[unit.id] && (
                            <div className="mt-3">
                                <button onClick={() => { setSelectedUnit(unit); setLessonModalOpen(true); }} className="text-sm bg-green-500 text-white px-3 py-1 rounded-md hover:bg-green-600 transition-colors mb-3">
                                    Add Lesson
                                </button>
                                <div className="space-y-2">
                                    {unit.lessons?.length > 0 ? unit.lessons.map(lesson => (
                                        <div key={lesson.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-md bg-white hover:bg-gray-100 transition-colors group">
                                            <p className="text-gray-700 cursor-pointer flex-grow" onClick={() => handleOpenLessonDetail(lesson, unit.id)}>{lesson.title}</p>
                                            <button onClick={(e) => handleOpenDeleteModal(e, lesson, unit.id)} className="p-1 rounded-full text-red-500 hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete Lesson">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )) : <p className="text-sm text-gray-500 pl-4">No lessons in this unit yet. Add one!</p>}
                                </div>
                            </div>
                        )}
                    </div>
                )) : (
                    <p className="text-gray-500 text-center py-8">No units in this subject yet. Add one to get started!</p>
                )}
            </div>

            <AddUnitModal isOpen={isUnitModalOpen} onClose={() => setUnitModalOpen(false)} onAddUnit={handleAddUnit} />
            <EditUnitModal isOpen={isEditUnitModalOpen} onClose={() => setEditUnitModalOpen(false)} onEditUnit={handleEditUnit} unit={unitToEdit}/>
            {selectedUnit && <LessonFormModal isOpen={isLessonModalOpen} onClose={() => setLessonModalOpen(false)} onSubmit={handleAddLesson} title="Add New Lesson" />}
            {isLessonDetailOpen && <LessonDetailModal isOpen={isLessonDetailOpen} onClose={() => setLessonDetailOpen(false)} lesson={selectedLessonForDetail} onEditRequest={(lesson) => {setLessonToEdit(lesson); setEditLessonModalOpen(true)}} onCourseUpdated={onCourseUpdated} />}
            {lessonToEdit && <LessonFormModal isOpen={isEditLessonModalOpen} onClose={() => setEditLessonModalOpen(false)} onSubmit={handleEditLesson} initialData={lessonToEdit} title="Edit Lesson" />}
            {isShareModalOpen && <ShareMultipleLessonsModal isOpen={isShareModalOpen} onClose={() => setShareModalOpen(false)} course={course} classes={classes} />}
            <DeleteLessonModal isOpen={isDeleteLessonModalOpen} onClose={() => setDeleteLessonModalOpen(false)} onConfirm={handleConfirmDeleteLesson} />
        </div>
    );
};

const AddUnitModal = ({ isOpen, onClose, onAddUnit }) => {
    const [title, setTitle] = useState('');
    const handleSubmit = (e) => {
        e.preventDefault();
        onAddUnit(title);
        setTitle('');
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Unit">
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Unit Title"
                    className="w-full p-3 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
                <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-md hover:bg-blue-600 transition-colors">Add Unit</button>
            </form>
        </Modal>
    );
};

const EditUnitModal = ({ isOpen, onClose, onEditUnit, unit }) => {
    const [title, setTitle] = useState('');

    useEffect(() => {
        if(unit) setTitle(unit.title);
    }, [unit]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onEditUnit(title);
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Unit Title">
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Unit Title"
                    className="w-full p-3 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
                <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-md hover:bg-blue-600 transition-colors">Save Changes</button>
            </form>
        </Modal>
    );
};

const EditCourseModal = ({ isOpen, onClose, onEditCourse, course }) => {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('');

    useEffect(() => {
        if(course) {
            setTitle(course.title);
            setCategory(course.category || COURSE_CATEGORIES[0]);
        }
    }, [course]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onEditCourse(title, category);
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Course">
            <form onSubmit={handleSubmit} className="space-y-4">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Course Title"
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
                 <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-3 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {COURSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-md hover:bg-blue-600 transition-colors">Save Changes</button>
            </form>
        </Modal>
    );
};

const LessonFormModal = ({ isOpen, onClose, onSubmit, initialData, title }) => {
    const [lessonTitle, setLessonTitle] = useState('');
    const [studyGuideUrl, setStudyGuideUrl] = useState('');
    const [pages, setPages] = useState([{ id: `page_${Date.now()}`, title: '', content: '' }]);

    useEffect(() => {
        if (initialData) {
            setLessonTitle(initialData.title);
            setStudyGuideUrl(initialData.studyGuideUrl || '');
            setPages(initialData.pages?.length > 0 ? initialData.pages.map(p => ({...p})) : [{ id: `page_${Date.now()}`, title: '', content: '' }]);
        } else {
            setLessonTitle('');
            setStudyGuideUrl('');
            setPages([{ id: `page_${Date.now()}`, title: '', content: '' }]);
        }
    }, [initialData, isOpen]);

    const handlePageContentChange = (index, content) => {
        const newPages = [...pages];
        newPages[index].content = content;
        setPages(newPages);
    };

    const handlePageTitleChange = (index, value) => {
        const newPages = [...pages];
        newPages[index].title = value;
        setPages(newPages);
    };


    const addPage = () => {
        setPages([...pages, { id: `page_${Date.now()}`, title: '', content: '' }]);
    };

    const removePage = (index) => {
        if (pages.length > 1) {
            setPages(pages.filter((_, i) => i !== index));
        }
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ title: lessonTitle, studyGuideUrl, pages });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="4xl">
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto p-2">
                 <input type="text" value={lessonTitle} onChange={e => setLessonTitle(e.target.value)} placeholder="Lesson Title" className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                 <input type="url" value={studyGuideUrl} onChange={e => setStudyGuideUrl(e.target.value)} placeholder="Study Guide URL (optional)" className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                
                <h4 className="font-semibold mt-4 text-gray-700">Lesson Pages</h4>
                {pages.map((page, index) => (
                    <div key={page.id || index} className="p-4 border border-gray-300 rounded-lg bg-gray-50 space-y-3 relative">
                         <button type="button" onClick={() => removePage(index)} className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold text-lg">&times;</button>
                        <input type="text" value={page.title} onChange={e => handlePageTitleChange(index, e.target.value)} placeholder={`Page ${index + 1} Title`} className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <RichTextEditor
                            value={page.content}
                            onChange={(content) => handlePageContentChange(index, content)}
                        />
                    </div>
                ))}
                <button type="button" onClick={addPage} className="w-full bg-gray-200 p-3 rounded-md hover:bg-gray-300 transition-colors">Add Page</button>
                <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-md hover:bg-blue-600 transition-colors">Save Lesson</button>
            </form>
        </Modal>
    );
};

const LessonDetailModal = ({ isOpen, onClose, lesson, onEditRequest, onCourseUpdated }) => {
    const [activeTab, setActiveTab] = useState('pages');
    const [isQuizModalOpen, setQuizModalOpen] = useState(false);
    const [isEditQuizModalOpen, setEditQuizModalOpen] = useState(false);
    const [quizToEdit, setQuizToEdit] = useState(null);
    const [activePage, setActivePage] = useState(0); // For pagination
    const { showToast } = useToast();

    useEffect(() => {
        // Reset to the first page when the modal is opened or the lesson changes
        setActivePage(0);
    }, [isOpen, lesson]);
    
    const handleAddQuiz = async (quizData) => {
        try {
            await firestoreService.addQuizToLesson(lesson.courseId, lesson.unitId, lesson.id, quizData);
            showToast("Quiz added!");
            setQuizModalOpen(false);
            onCourseUpdated(); 
        } catch (error) {
            console.error("Error adding quiz:", error);
            showToast("Failed to add quiz.", 'error');
        }
    };

    const handleEditQuiz = async (newQuizData) => {
        if (!quizToEdit) return;
        try {
            await firestoreService.editQuiz(lesson.courseId, lesson.unitId, lesson.id, quizToEdit.id, newQuizData);
            showToast("Quiz updated!");
            setEditQuizModalOpen(false);
            onCourseUpdated();
        } catch(error) {
            console.error("Error editing quiz:", error);
            showToast("Failed to edit quiz.", 'error');
        }
    };

    const totalPages = lesson.pages?.length || 0;

    return(
        <Modal isOpen={isOpen} onClose={onClose} title={lesson.title} size="4xl">
            <div className="flex justify-end space-x-2 mb-4">
                {lesson.studyGuideUrl && <a href={lesson.studyGuideUrl} target="_blank" rel="noopener noreferrer" className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors">Download Study Guide</a>}
                <button onClick={() => onEditRequest(lesson)} className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors">Edit Lesson</button>
            </div>
             <div className="border-b border-gray-200 mb-4">
                <button onClick={() => setActiveTab('pages')} className={`py-2 px-4 rounded-t-lg ${activeTab === 'pages' ? 'border-b-2 border-blue-500 font-semibold text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>Pages</button>
                <button onClick={() => setActiveTab('quizzes')} className={`py-2 px-4 rounded-t-lg ${activeTab === 'quizzes' ? 'border-b-2 border-blue-500 font-semibold text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>Quizzes</button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto p-2">
                {activeTab === 'pages' && (
                    totalPages > 0 ? (
                        <div>
                            <div className="p-4 border border-gray-200 rounded-lg shadow-sm bg-white min-h-[30vh]">
                                <h4 className="font-bold text-xl text-gray-800 mb-2">{lesson.pages[activePage].title}</h4>
                                <div className="mt-2 prose max-w-none" dangerouslySetInnerHTML={{ __html: lesson.pages[activePage].content }} />
                            </div>
                            <div className="flex justify-between items-center mt-4">
                                <button onClick={() => setActivePage(p => p - 1)} disabled={activePage === 0} className="flex items-center bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <ChevronLeft size={20} className="mr-1" />
                                    Previous
                                </button>
                                <span className="text-gray-600 font-medium">Page {activePage + 1} of {totalPages}</span>
                                <button onClick={() => setActivePage(p => p + 1)} disabled={activePage >= totalPages - 1} className="flex items-center bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">
                                    Next
                                    <ChevronRight size={20} className="ml-1" />
                                </button>
                            </div>
                        </div>
                    ) : (
                         <p className="text-gray-500 text-center py-8">This lesson has no pages.</p>
                    )
                )}
                {activeTab === 'quizzes' && (
                    <div>
                         <button onClick={() => setQuizModalOpen(true)} className="bg-yellow-500 text-white px-4 py-2 rounded-md hover:bg-yellow-600 transition-colors mb-4">Add Quiz</button>
                         {lesson.quizzes?.length > 0 ? lesson.quizzes.map(quiz => (
                             <div key={quiz.id} className="p-4 border border-gray-200 rounded-lg mb-3 flex justify-between items-center bg-white">
                                 <p className="font-semibold text-gray-700">{quiz.title}</p>
                                 <button onClick={() => { setQuizToEdit(quiz); setEditQuizModalOpen(true); }} className="bg-blue-500 text-white px-3 py-1 rounded-md hover:bg-blue-600 transition-colors text-sm">Edit</button>
                             </div>
                         )) : (
                             <p className="text-gray-500 text-center py-8">This lesson has no quizzes.</p>
                         )}
                         <AddQuizModal isOpen={isQuizModalOpen} onClose={() => setQuizModalOpen(false)} onAddQuiz={handleAddQuiz} />
                         {quizToEdit && <EditQuizModal isOpen={isEditQuizModalOpen} onClose={() => setEditQuizModalOpen(false)} onEditQuiz={handleEditQuiz} quiz={quizToEdit} />}
                    </div>
                )}
            </div>
        </Modal>
    );
};

const QuizFormModal = ({ isOpen, onClose, onSubmit, initialQuizData, title }) => {
    const [quizTitle, setQuizTitle] = useState('');
    const [questions, setQuestions] = useState([{ text: '', options: ['', '', '', ''], correctOption: 0, explanation: '' }]);

    useEffect(() => {
        if (initialQuizData) {
            setQuizTitle(initialQuizData.title);
            setQuestions(initialQuizData.questions.map(q => ({...q, explanation: q.explanation || ''})));
        } else {
            setQuizTitle('');
            setQuestions([{ text: '', options: ['', '', '', ''], correctOption: 0, explanation: '' }]);
        }
    }, [initialQuizData, isOpen]);

    const handleQuestionChange = (index, field, value) => {
        const newQuestions = [...questions];
        newQuestions[index][field] = value;
        setQuestions(newQuestions);
    };
    
    const handleOptionChange = (qIndex, oIndex, value) => {
        const newQuestions = [...questions];
        newQuestions[qIndex].options[oIndex] = value;
        setQuestions(newQuestions);
    };

    const addQuestion = () => {
        setQuestions([...questions, { text: '', options: ['', '', '', ''], correctOption: 0, explanation: '' }]);
    };
    
    const removeQuestion = (index) => {
        if (questions.length > 1) {
            setQuestions(questions.filter((_, i) => i !== index));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const quizData = { title: quizTitle, questions };
        onSubmit(quizData);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto p-2">
                <input
                    type="text"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    placeholder="Quiz Title"
                    className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
                {questions.map((q, qIndex) => (
                    <div key={qIndex} className="p-4 border border-gray-300 rounded-lg bg-gray-50 relative">
                        <button type="button" onClick={() => removeQuestion(qIndex)} className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold text-lg">&times;</button>
                        <textarea
                            value={q.text}
                            onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)}
                            placeholder={`Question ${qIndex + 1}`}
                            className="w-full p-3 border rounded-md mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows="2"
                            required
                        />
                        <div className="space-y-2">
                            {q.options.map((opt, oIndex) => (
                                 <div key={oIndex} className="flex items-center">
                                     <input
                                         type="radio"
                                         name={`correct-option-${qIndex}`}
                                         checked={q.correctOption === oIndex}
                                         onChange={() => handleQuestionChange(qIndex, 'correctOption', oIndex)}
                                         className="mr-3 text-blue-600 focus:ring-blue-500"
                                     />
                                     <input
                                         type="text"
                                         value={opt}
                                         onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                                         placeholder={`Option ${oIndex + 1}`}
                                         className="flex-grow p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                         required
                                     />
                                 </div>
                            ))}
                        </div>
                         <textarea
                            value={q.explanation}
                            onChange={(e) => handleQuestionChange(qIndex, 'explanation', e.target.value)}
                            placeholder="Explanation for correct answer (optional)"
                            className="w-full p-3 border rounded-md mt-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows="2"
                        />
                    </div>
                ))}
                <button type="button" onClick={addQuestion} className="w-full bg-gray-200 p-3 rounded-md hover:bg-gray-300 transition-colors">Add Another Question</button>
                <button type="submit" className="w-full bg-yellow-500 text-white p-3 rounded-md hover:bg-yellow-600 transition-colors">
                    {initialQuizData ? 'Save Changes' : 'Add Quiz'}
                </button>
            </form>
        </Modal>
    );
};

const AddQuizModal = ({ isOpen, onClose, onAddQuiz }) => (
    <QuizFormModal 
        isOpen={isOpen}
        onClose={onClose}
        onSubmit={onAddQuiz}
        title="Add New Quiz"
    />
);

const EditQuizModal = ({ isOpen, onClose, onEditQuiz, quiz }) => (
    <QuizFormModal 
        isOpen={isOpen}
        onClose={onClose}
        onSubmit={onEditQuiz}
        initialQuizData={quiz}
        title="Edit Quiz"
    />
);


const ShareMultipleLessonsModal = ({ isOpen, onClose, course, classes }) => {
    const { showToast } = useToast();
    const [selectedLessons, setSelectedLessons] = useState({});
    const [selectedClass, setSelectedClass] = useState('');
    const [availableFrom, setAvailableFrom] = useState('');
    const [availableUntil, setAvailableUntil] = useState('');

    useEffect(() => {
        if(classes.length > 0) {
            setSelectedClass(classes[0].id)
        }
    }, [classes]);

    const handleLessonToggle = (unitId, lessonId) => {
        const newSelectedLessons = {...selectedLessons};
        if(newSelectedLessons[lessonId]){
            delete newSelectedLessons[lessonId];
        } else {
            const lesson = course.units.find(u => u.id === unitId)?.lessons.find(l => l.id === lessonId);
            newSelectedLessons[lessonId] = {unitId, quizzes: lesson.quizzes.map(q=> q.id)};
        }
        setSelectedLessons(newSelectedLessons);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!availableFrom || !availableUntil) {
            showToast("Please select both 'Available From' and 'Available Until' dates.", 'error');
            return;
        }

        if (Object.keys(selectedLessons).length === 0 || !selectedClass) {
            showToast("Please select at least one lesson and a class.", 'error');
            return;
        }
        
        try {
            await firestoreService.updateCourseAccess(selectedClass, course.id, selectedLessons, availableFrom, availableUntil);
            showToast("Content shared successfully!");
            onClose();
        } catch(error) {
            showToast("Failed to share content.", 'error');
            console.error(error);
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Share Content from ${course.title}`} size="lg">
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label htmlFor="availableFrom" className="block text-sm font-medium text-gray-700 mb-1">Available From</label>
                        <input 
                            type="datetime-local" 
                            id="availableFrom"
                            value={availableFrom}
                            onChange={e => setAvailableFrom(e.target.value)}
                            className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                     <div>
                        <label htmlFor="availableUntil" className="block text-sm font-medium text-gray-700 mb-1">Available Until</label>
                        <input 
                            type="datetime-local" 
                            id="availableUntil"
                            value={availableUntil}
                            onChange={e => setAvailableUntil(e.target.value)}
                            className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                </div>
                <div className="max-h-[50vh] overflow-y-auto mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                {course.units?.length > 0 ? course.units.map(unit => (
                    <div key={unit.id} className="mb-3">
                        <h4 className="font-semibold bg-gray-100 p-2 rounded-md text-gray-800">{unit.title}</h4>
                        <div className="pl-4 mt-2">
                        {unit.lessons.length > 0 ? unit.lessons.map(lesson => (
                            <div key={lesson.id} className="my-2">
                                <label className="flex items-center text-gray-700 cursor-pointer">
                                    <input type="checkbox" className="mr-2 rounded-sm text-blue-600 focus:ring-blue-500" onChange={() => handleLessonToggle(unit.id, lesson.id)} checked={!!selectedLessons[lesson.id]}/>
                                    {lesson.title}
                                </label>
                            </div>
                        )) : <p className="text-sm text-gray-500">No lessons in this unit.</p>}
                        </div>
                    </div>
                )) : <p className="text-gray-500 text-center py-4">No units in this course.</p>}
                </div>
                 <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full p-2 border rounded-md mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 transition-colors">Share Selected</button>
            </form>
        </Modal>
    );
};

const ClassOverviewModal = ({ isOpen, onClose, classData }) => {
    const [activeTab, setActiveTab] = useState('students'); // Default to students tab
    const [analytics, setAnalytics] = useState({ quizzes: [], allSubmissions: [] });
    const [studentsMap, setStudentsMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const { showToast } = useToast();
    
    useEffect(() => {
        if (!isOpen || !classData) return;

        const fetchAnalytics = async () => {
            setLoading(true);

            // 1. Get student info
            const studentIds = classData.students || [];
            let sMap = new Map();
            if (studentIds.length > 0) {
                const studentChunks = [];
                for (let i = 0; i < studentIds.length; i += 30) {
                    studentChunks.push(studentIds.slice(i, i + 30));
                }
                const studentPromises = studentChunks.map(chunk => 
                    getDocs(query(collection(db, "users"), where("__name__", "in", chunk)))
                );
                const studentSnapshots = await Promise.all(studentPromises);
                studentSnapshots.forEach(snapshot => {
                    snapshot.docs.forEach(doc => {
                         sMap.set(doc.id, { id: doc.id, ...doc.data() });
                    });
                });
                setStudentsMap(sMap);
            }

            // 2. Get shared content structure
            const courseAccess = classData.courseAccess || {};
            const courseIds = Object.keys(courseAccess);
            if (courseIds.length === 0) {
                setAnalytics({ quizzes: [], allSubmissions: [] });
                setLoading(false);
                return;
            }
            const coursesQuery = query(collection(db, "courses"), where("__name__", "in", courseIds));
            const coursesSnapshot = await getDocs(coursesQuery);
            const contentTree = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(Boolean);

            // 3. Flatten quizzes
            let allQuizzes = [];
            contentTree.forEach(course => {
                course.units?.forEach(unit => {
                    unit.lessons?.forEach(lesson => {
                        lesson.quizzes?.forEach(quiz => {
                            allQuizzes.push({ ...quiz, courseTitle: course.title, lessonTitle: lesson.title });
                        });
                    });
                });
            });

            // 4. Fetch all submissions for all students in the class
            let allSubmissions = [];
            if(studentIds.length > 0) {
                const submissionsQuery = query(collection(db, "submissions"), where("studentId", "in", studentIds));
                const submissionsSnap = await getDocs(submissionsQuery);
                allSubmissions = submissionsSnap.docs.map(doc => doc.data());
            }

            setAnalytics({ quizzes: allQuizzes, allSubmissions });
            setLoading(false);
        };
        
        fetchAnalytics();
    }, [isOpen, classData]);

    const handleRemoveStudent = async (studentId) => {
        try {
            await firestoreService.removeStudentFromClass(classData.id, studentId);
            showToast("Student removed successfully.");
            // Refresh data
            const updatedStudentsMap = new Map(studentsMap);
            updatedStudentsMap.delete(studentId);
            setStudentsMap(updatedStudentsMap);
        } catch (error) {
            showToast("Failed to remove student.", "error");
            console.error("Error removing student:", error);
        }
    };

    return (
        <>
        <Modal isOpen={isOpen} onClose={onClose} title={`Overview for ${classData?.name}`} size="6xl">
            {loading ? <Spinner /> : (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <div className="border-b border-gray-200">
                            <button onClick={() => setActiveTab('students')} className={`py-2 px-4 rounded-t-lg ${activeTab === 'students' ? 'border-b-2 border-blue-500 font-semibold text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>Students</button>
                            <button onClick={() => setActiveTab('quizzes')} className={`py-2 px-4 rounded-t-lg ${activeTab === 'quizzes' ? 'border-b-2 border-blue-500 font-semibold text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>Quizzes</button>
                        </div>
                        <button onClick={() => setIsDownloadModalOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm flex items-center gap-2">
                            <Download size={16} />
                            Download Report
                        </button>
                    </div>
                    <div className="mt-4 max-h-[60vh] overflow-y-auto">
                        {activeTab === 'students' && (
                            <div className="space-y-2">
                                {studentsMap.size > 0 ? Array.from(studentsMap.values()).map(student => (
                                    <div key={student.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-md">
                                        <p>{student.firstName} {student.lastName} ({student.email})</p>
                                        <button onClick={() => handleRemoveStudent(student.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100">
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                )) : <p className="text-gray-500 text-center py-4">No students enrolled in this class.</p>}
                            </div>
                        )}
                        {activeTab === 'quizzes' && (
                           <div className="overflow-x-auto rounded-lg shadow-sm border">
                               <table className="min-w-full divide-y divide-gray-200">
                                   <thead className="bg-gray-50">
                                       <tr>
                                           <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Student</th>
                                           {analytics.quizzes.map(quiz => (
                                               <th key={quiz.id} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{quiz.title}</th>
                                           ))}
                                       </tr>
                                   </thead>
                                   <tbody className="bg-white divide-y divide-gray-200">
                                       {Array.from(studentsMap.values()).map(student => (
                                           <tr key={student.id}>
                                               <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">{student.firstName} {student.lastName}</td>
                                               {analytics.quizzes.map(quiz => {
                                                   const submission = analytics.allSubmissions.find(s => s.studentId === student.id && s.quizId === quiz.id);
                                                   return (
                                                        <td key={quiz.id} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                                            {submission ? `${submission.score}/${submission.totalQuestions}` : 'N/A'}
                                                        </td>
                                                   )
                                               })}
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                               {studentsMap.size === 0 && <p className="text-gray-500 text-center py-4">No students enrolled in this class.</p>}
                           </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
        <DownloadReportModal 
            isOpen={isDownloadModalOpen} 
            onClose={() => setIsDownloadModalOpen(false)} 
            classData={classData} 
            analytics={analytics} 
            studentsMap={studentsMap} 
        />
        </>
    );
};

const DownloadReportModal = ({ isOpen, onClose, classData, analytics, studentsMap }) => {
    const { showToast } = useToast();

    const handleDownload = (groupBy) => {
        if (!window.XLSX) {
            showToast("Excel library is loading. Please try again in a moment.", "error");
            return;
        }

        const uniqueQuizzes = analytics.quizzes.reduce((acc, quiz) => {
            if (!acc.some(q => q.id === quiz.id)) {
                acc.push(quiz);
            }
            return acc;
        }, []);

        let studentData = Array.from(studentsMap.values());

        // Sort students based on the chosen criteria
        if (groupBy === 'lastName') {
            studentData.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
        } else if (groupBy === 'gender') {
            studentData.sort((a, b) => (a.gender || 'Z').localeCompare(b.gender || 'Z'));
        }

        // Prepare Quiz Overview
        const quizOverview = uniqueQuizzes.map(q => ({
            'Topics': q.title,
            'Question Count': q.questions.length
        }));

        // Prepare Student Data
        const studentRows = studentData.map(student => {
            let totalFirstAttemptScore = 0; 
            const row = {
                'Last Name': student.lastName,
                'First Name': student.firstName,
                'Gender': student.gender || 'Not specified'
            };
            
            uniqueQuizzes.forEach(quiz => {
                const studentSubmissionsForQuiz = analytics.allSubmissions.filter(
                    sub => sub.studentId === student.id && sub.quizId === quiz.id
                );

                let firstAttemptScore = 'N/A';
                let highestScoreValue = 'N/A';

                if (studentSubmissionsForQuiz.length > 0) {
                    studentSubmissionsForQuiz.sort((a, b) => a.submittedAt.seconds - b.submittedAt.seconds);
                    
                    firstAttemptScore = studentSubmissionsForQuiz[0].score; 
                    
                    const maxScore = Math.max(...studentSubmissionsForQuiz.map(s => s.score));
                    highestScoreValue = maxScore;
                    
                    if (typeof firstAttemptScore === 'number') {
                        totalFirstAttemptScore += firstAttemptScore;
                    }
                }

                row[`${quiz.title}_first_attempt`] = firstAttemptScore;
                row[`${quiz.title}_highest_score`] = highestScoreValue;
            });

            row['Total First Attempt Score'] = totalFirstAttemptScore;
            return row;
        });
        
        // Create worksheet
        const wb = window.XLSX.utils.book_new();
        const ws = window.XLSX.utils.json_to_sheet(quizOverview, { skipHeader: false });
        
        // Create complex header for student results
        const header = [
            'Last Name', 'First Name', 'Gender',
            ...uniqueQuizzes.flatMap(q => [q.title, q.title]),
            'Total First Attempt Score'
        ];
        const subHeader = [
            '', '', '',
            ...uniqueQuizzes.flatMap(() => ['First Attempt Raw Score', 'Highest Raw Score']),
            ''
        ];

        window.XLSX.utils.sheet_add_aoa(ws, [[]], { origin: -1 }); // Spacer
        const studentHeaderRowIndex = quizOverview.length + 3;
        window.XLSX.utils.sheet_add_aoa(ws, [header, subHeader], { origin: studentHeaderRowIndex - 1 });
        window.XLSX.utils.sheet_add_json(ws, studentRows, { origin: studentHeaderRowIndex + 1, skipHeader: true });
        
        // Styling
        const headerStyle = { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { fgColor: { rgb: "FF4F81BD" } } }; // Dark Blue
        const subHeaderStyle = { font: { bold: true }, fill: { fgColor: { rgb: "FFDDEBF7" } } }; // Light Blue
        const totalHeaderStyle = { font: { bold: true, color: { rgb: "FFFFFFFF" } }, fill: { fgColor: { rgb: "FF70AD47" } } }; // Green

        // Apply styles to main headers
        for(let C = 0; C < header.length; ++C) {
            const cellAddress = window.XLSX.utils.encode_cell({c:C, r:studentHeaderRowIndex -1});
            if(!ws[cellAddress]) ws[cellAddress] = {v: header[C]};
            ws[cellAddress].s = C === header.length - 1 ? totalHeaderStyle : headerStyle;
        }
        
        // Apply styles to sub-headers
        for(let C = 0; C < subHeader.length; ++C) {
            if (subHeader[C] === '') continue;
            const cellAddress = window.XLSX.utils.encode_cell({c:C, r:studentHeaderRowIndex});
             if(!ws[cellAddress]) ws[cellAddress] = {v: subHeader[C]};
            ws[cellAddress].s = subHeaderStyle;
        }

        // Merging header cells
        const merges = [];
        let col = 3;
        uniqueQuizzes.forEach(() => {
            merges.push({ s: { r: studentHeaderRowIndex - 1, c: col }, e: { r: studentHeaderRowIndex - 1, c: col + 1 } });
            col += 2;
        });
        ws['!merges'] = merges;

        // Auto-size columns
        const cols = [{wch: 20}, {wch: 20}, {wch:15}]; // For Name and Gender
        uniqueQuizzes.forEach(q => {
            cols.push({wch: 25});
            cols.push({wch: 25});
        });
        cols.push({wch: 20}); // Total score
        ws['!cols'] = cols;

        window.XLSX.utils.book_append_sheet(wb, ws, "Quiz Results");
        window.XLSX.writeFile(wb, `Quiz_Report_${classData.name.replace(/\s+/g, '_')}.xlsx`);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Download Quiz Report">
            <div className="space-y-4">
                <p>How would you like to group the student results in the report?</p>
                <button onClick={() => handleDownload('lastName')} className="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 transition-colors">
                    Group by Last Name
                </button>
                <button onClick={() => handleDownload('gender')} className="w-full bg-green-600 text-white p-3 rounded-md hover:bg-green-700 transition-colors">
                    Group by Gender
                </button>
            </div>
        </Modal>
    );
};

const EditClassModal = ({ isOpen, onClose, onSave, classData }) => {
    const [name, setName] = useState('');

    useEffect(() => {
        if (classData) {
            setName(classData.name);
        }
    }, [classData]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            onSave(name.trim());
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Edit Class Name">
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
                <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-md hover:bg-blue-600 transition-colors">
                    Save Changes
                </button>
            </form>
        </Modal>
    );
};

const CategoryDetailView = ({ category, courses, classes, onBack, onCourseUpdated }) => {
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [isEditCourseModalOpen, setEditCourseModalOpen] = useState(false);
    const [courseToEdit, setCourseToEdit] = useState(null);
    const { showToast } = useToast();

    // Select the first course by default, or handle updates to the selected course
    useEffect(() => {
        const firstCourse = courses[0];
        if (selectedCourse) {
            const updatedSelectedCourse = courses.find(c => c.id === selectedCourse.id);
            setSelectedCourse(updatedSelectedCourse || firstCourse || null);
        } else {
            setSelectedCourse(firstCourse || null);
        }
    }, [courses, selectedCourse]);

    const handleEditCourse = async (newTitle, newCategory) => {
        if(!courseToEdit) return;
        try {
            await firestoreService.editCourse(courseToEdit.id, newTitle, newCategory);
            showToast("Subject updated successfully!");
            setEditCourseModalOpen(false);
            onCourseUpdated(); // This will trigger the useEffect above to refresh state
        } catch(error) {
            showToast("Failed to update subject.", 'error');
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-100">
            <header className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-20 md:hidden">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200">&larr;</button>
                 <select 
                    value={selectedCourse?.id || ''} 
                    onChange={e => setSelectedCourse(courses.find(c => c.id === e.target.value))}
                    className="flex-grow mx-4 p-2 border border-gray-300 rounded-md bg-white"
                >
                    <option value="" disabled>Select a Subject</option>
                    {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
            </header>
            <div className="flex-1 flex overflow-hidden">
                {/* Left Column - Subject List (Visible on Medium screens and up) */}
                <aside className="w-1/3 md:w-1/4 bg-white p-4 border-r border-gray-200 overflow-y-auto hidden md:block">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800 truncate">Subjects</h2>
                        <button onClick={onBack} className="text-sm text-blue-600 hover:underline">Back</button>
                    </div>
                    {courses.length > 0 ? courses.map(course => (
                        <div key={course.id} className={`p-3 rounded-lg mb-2 cursor-pointer group relative flex justify-between items-center ${selectedCourse?.id === course.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`} onClick={() => setSelectedCourse(course)}>
                            <p className="font-semibold text-sm text-gray-700 truncate pr-8">{course.title}</p>
                            <button onClick={(e) => { e.stopPropagation(); setCourseToEdit(course); setEditCourseModalOpen(true)}} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-gray-300 text-gray-700 p-1 rounded-md hover:bg-gray-400 transition-colors opacity-0 group-hover:opacity-100">
                                <MoreVertical size={14}/>
                            </button>
                        </div>
                    )) : <p className="text-gray-500 text-sm">No subjects in this category.</p>}
                </aside>
                {/* Main Content - Course View */}
                <main className="flex-1 p-2 sm:p-4 md:p-6 overflow-y-auto bg-gray-100">
                    {selectedCourse ? (
                        <TeacherCourseView key={selectedCourse.id} course={selectedCourse} classes={classes} onCourseUpdated={onCourseUpdated}/>
                    ) : (
                        <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500 h-full flex flex-col justify-center">
                             <BookOpen size={48} className="mx-auto text-gray-300 mb-4"/>
                            <p className="font-semibold">Select a subject to manage its content.</p>
                            <p className="mt-2 text-sm">If this category is empty, create a new subject from the main dashboard.</p>
                        </div>
                    )}
                </main>
            </div>
            <EditCourseModal isOpen={isEditCourseModalOpen} onClose={() => setEditCourseModalOpen(false)} onEditCourse={handleEditCourse} course={courseToEdit} />
        </div>
    );
}

// Teacher Dashboard Page
const TeacherDashboard = () => {
    const { user, userProfile, logout } = useAuth();
    const [classes, setClasses] = useState([]);
    const [courses, setCourses] = useState([]);
    const [activeView, setActiveView] = useState('home');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile sidebar
    const [classOverviewModal, setClassOverviewModal] = useState({ isOpen: false, classData: null });
    const [isEditClassModalOpen, setEditClassModalOpen] = useState(false);
    const [classToEdit, setClassToEdit] = useState(null);
    const { showToast } = useToast();

    // Fetch real-time data for classes and courses
    useEffect(() => {
        if (!user) return;
        const classesUnsub = onSnapshot(query(collection(db, "classes"), where("teacherId", "==", user.uid)), (snap) => setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const coursesUnsub = onSnapshot(query(collection(db, "courses")), (snap) => setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { classesUnsub(); coursesUnsub(); };
    }, [user]);

    const handleClassDelete = async (e, classId) => {
        e.stopPropagation();
        try {
            await firestoreService.deleteClass(classId);
            showToast("Class deleted successfully!");
        } catch (error) {
            showToast("Failed to delete class.", 'error');
        }
    };

    const handleOpenEditClassModal = (e, classData) => {
        e.stopPropagation();
        setClassToEdit(classData);
        setEditClassModalOpen(true);
    };

    const handleSaveClassName = async (newName) => {
        if (!classToEdit) return;
        try {
            await firestoreService.editClassName(classToEdit.id, newName);
            showToast("Class name updated successfully!");
            setEditClassModalOpen(false);
            setClassToEdit(null);
        } catch (error) {
            showToast("Failed to update class name.", 'error');
            console.error("Error updating class name:", error);
        }
    };
    
    const handleCategoryClick = (category) => {
        setSelectedCategory(category);
        setActiveView('courses'); // Ensure view is set correctly
    };

    const handleViewChange = (view) => {
        setActiveView(view);
        setSelectedCategory(null); // Deselect category when changing main view
        setIsSidebarOpen(false); // Close sidebar on navigation
    };
    
    // Main content renderer
    const renderMainContent = () => {
        if (selectedCategory) {
            const filteredCourses = courses.filter(c => c.category === selectedCategory)
            return <CategoryDetailView category={selectedCategory} courses={filteredCourses} classes={classes} onBack={() => setSelectedCategory(null)} onCourseUpdated={() => {}} />;
        }
        switch (activeView) {
            case 'home': return <div className="space-y-6"><CreateClassPost teacherId={user.uid} onClassCreated={()=>{}} /><CreateCoursePost teacherId={user.uid}  onCourseCreated={()=>{}} /></div>;
            case 'classes': return <div className="space-y-4">{classes.length > 0 ? classes.map(c => <ClassCard key={c.id} classData={c} onClick={(data) => setClassOverviewModal({ isOpen: true, classData: data })} onEdit={(e) => handleOpenEditClassModal(e, c)} onDelete={(e) => handleClassDelete(e, c.id)} />) : <p className="bg-white p-6 rounded-lg shadow-md text-gray-500 text-center">No classes created yet.</p>}</div>;
            case 'courses': return <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">{COURSE_CATEGORIES.map(cat => <CourseCategoryCard key={cat} category={cat} courseCount={courses.filter(c => c.category === cat).length} onClick={handleCategoryClick} />)}</div>;
            case 'profile': return <ProfilePage onBack={() => handleViewChange('home')} />;
            default: return null;
        }
    };
    
    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            {/* Top Nav */}
            <nav className="bg-white shadow-md p-2 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 mr-2 rounded-full hover:bg-gray-200 md:hidden"><Menu/></button>
                    <img src="https://i.ibb.co/XfJ8scGX/1.png" alt="SRCS Logo" className="w-9 h-9 rounded-full mr-2" />
                    <span className="text-blue-600 font-bold text-xl hidden sm:block">SRCS LMS</span>
                </div>
                <div className="flex items-center space-x-2 md:space-x-3">
                    <button className="p-2 rounded-full hover:bg-gray-200"><Search size={20}/></button>
                     <div onClick={() => handleViewChange('profile')} className="flex items-center space-x-2 cursor-pointer p-1 rounded-full hover:bg-gray-100">
                        <UserInitialsAvatar firstName={userProfile?.firstName} lastName={userProfile?.lastName} size="sm" />
                        <span className="font-semibold text-sm hidden sm:inline-block">{userProfile?.firstName || 'Profile'}</span>
                    </div>
                    <button onClick={logout} className="p-2 rounded-full hover:bg-red-100 text-red-600" title="Logout"><LogOut size={20} /></button>
                </div>
            </nav>

            {/* Mobile Sidebar */}
            <aside className={`fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:hidden`}>
                <div className="p-4">
                    <button onClick={() => setIsSidebarOpen(false)} className="absolute top-2 right-2 p-2"><X /></button>
                    <div className="flex items-center mb-4">
                        <UserInitialsAvatar firstName={userProfile?.firstName} lastName={userProfile?.lastName} size="md" />
                        <span className="font-semibold ml-3">{userProfile?.firstName} {userProfile?.lastName}</span>
                    </div>
                    <nav>
                        <SidebarButton icon={<Home size={20} />} text="Home" onClick={() => handleViewChange('home')} isActive={activeView === 'home' && !selectedCategory} />
                        <SidebarButton icon={<School size={20} />} text="Manage Classes" onClick={() => handleViewChange('classes')} isActive={activeView === 'classes'} />
                        <SidebarButton icon={<BookOpen size={20} />} text="Manage Subjects" onClick={() => handleViewChange('courses')} isActive={activeView === 'courses'} />
                        <SidebarButton icon={<User size={20} />} text="My Profile" onClick={() => handleViewChange('profile')} isActive={activeView === 'profile'} />
                    </nav>
                </div>
            </aside>
            {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"></div>}

            {/* Main Content Area */}
            <div className="flex w-full min-h-[calc(100vh-56px)]">
                 {/* Desktop Sidebar */}
                <aside className="w-1/5 hidden md:block flex-shrink-0 p-4">
                    <div className="bg-white rounded-lg shadow-md p-4 sticky top-20">
                         <nav>
                            <SidebarButton icon={<Home size={20} />} text="Home" onClick={() => handleViewChange('home')} isActive={activeView === 'home' && !selectedCategory} />
                            <SidebarButton icon={<School size={20} />} text="Manage Classes" onClick={() => handleViewChange('classes')} isActive={activeView === 'classes'} />
                            <SidebarButton icon={<BookOpen size={20} />} text="Manage Subjects" onClick={() => handleViewChange('courses')} isActive={activeView === 'courses' || selectedCategory} />
                            <SidebarButton icon={<User size={20} />} text="My Profile" onClick={() => handleViewChange('profile')} isActive={activeView === 'profile'} />
                        </nav>
                    </div>
                </aside>
                {/* Central Content */}
                <main className="flex-1 p-4 overflow-y-auto" style={{ paddingBottom: '80px' }}>{renderMainContent()}</main>
            </div>
            
            {/* Mobile Bottom Navigation */}
            <footer className="fixed bottom-0 left-0 right-0 bg-white shadow-t-md p-2 flex justify-around md:hidden z-30 border-t">
                <BottomNavItem icon={<Home/>} text="Home" onClick={() => handleViewChange('home')} isActive={activeView === 'home' && !selectedCategory} />
                <BottomNavItem icon={<School/>} text="Classes" onClick={() => handleViewChange('classes')} isActive={activeView === 'classes'} />
                <BottomNavItem icon={<BookOpen/>} text="Subjects" onClick={() => handleViewChange('courses')} isActive={activeView === 'courses' || selectedCategory} />
                <BottomNavItem icon={<User/>} text="Profile" onClick={() => handleViewChange('profile')} isActive={activeView === 'profile'} />
            </footer>
            
            {/* Modals */}
            {classOverviewModal.isOpen && <ClassOverviewModal isOpen={classOverviewModal.isOpen} onClose={() => setClassOverviewModal({isOpen: false, classData: null})} classData={classOverviewModal.classData} />}
            <EditClassModal isOpen={isEditClassModalOpen} onClose={() => setEditClassModalOpen(false)} onSave={handleSaveClassName} classData={classToEdit} />
        </div>
    );
};
const SidebarButton = ({ icon, text, onClick, isActive }) => (
    <button onClick={onClick} className={`flex items-center w-full p-3 my-1 rounded-lg text-left transition-colors ${isActive ? 'bg-blue-100 font-semibold text-blue-800' : 'text-gray-700 hover:bg-gray-100'}`}>
        <span className="mr-3 text-xl">{icon}</span>
        <span className="text-sm">{text}</span>
    </button>
);
const BottomNavItem = ({ icon, text, onClick, isActive }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center p-1 rounded-lg w-1/4 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
        {icon}
        <span className="text-xs mt-1">{text}</span>
    </button>
);

// --- STUDENT DASHBOARD & RELATED COMPONENTS ---

const StudentLessonDetailModal = ({ isOpen, onClose, lesson, onTakeQuiz, hasTakenQuiz, getAttemptsCount }) => {
    const [activeTab, setActiveTab] = useState('pages');
    const [activePage, setActivePage] = useState(0);

    useEffect(() => {
        setActivePage(0);
        if(lesson?.quizzes?.length > 0 && lesson?.pages?.length === 0){
            setActiveTab('quizzes');
        } else {
            setActiveTab('pages');
        }
    }, [isOpen, lesson]);

    const totalPages = lesson.pages?.length || 0;

    return(
        <Modal isOpen={isOpen} onClose={onClose} title={lesson.title} size="4xl">
            <div className="flex justify-end space-x-2 mb-4">
                {lesson.studyGuideUrl && <a href={lesson.studyGuideUrl} target="_blank" rel="noopener noreferrer" className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors">Download Study Guide</a>}
            </div>
             <div className="border-b border-gray-200 mb-4">
                <button onClick={() => setActiveTab('pages')} className={`py-2 px-4 rounded-t-lg ${activeTab === 'pages' ? 'border-b-2 border-blue-500 font-semibold text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>Pages</button>
                <button onClick={() => setActiveTab('quizzes')} className={`py-2 px-4 rounded-t-lg ${activeTab === 'quizzes' ? 'border-b-2 border-blue-500 font-semibold text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>Quizzes</button>
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto p-2">
                {activeTab === 'pages' && (
                    totalPages > 0 ? (
                        <div>
                            <div className="p-4 border border-gray-200 rounded-lg shadow-sm bg-white min-h-[30vh]">
                                <h4 className="font-bold text-xl text-gray-800 mb-2">{lesson.pages[activePage].title}</h4>
                                <div className="mt-2 prose max-w-none" dangerouslySetInnerHTML={{ __html: lesson.pages[activePage].content }} />
                            </div>
                            <div className="flex justify-between items-center mt-4">
                                <button onClick={() => setActivePage(p => p - 1)} disabled={activePage === 0} className="flex items-center bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <ChevronLeft size={20} className="mr-1" />
                                    Previous
                                </button>
                                <span className="text-gray-600 font-medium">Page {activePage + 1} of {totalPages}</span>
                                <button onClick={() => setActivePage(p => p + 1)} disabled={activePage >= totalPages - 1} className="flex items-center bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">
                                    Next
                                    <ChevronRight size={20} className="ml-1" />
                                </button>
                            </div>
                        </div>
                    ) : (
                         <p className="text-gray-500 text-center py-8">This lesson has no pages.</p>
                    )
                )}
                {activeTab === 'quizzes' && (
                    <div>
                         {lesson.quizzes?.length > 0 ? lesson.quizzes.map(quiz => (
                             <div key={quiz.id} className="p-4 border border-gray-200 rounded-lg mb-3 flex justify-between items-center bg-white">
                                 <div>
                                     <p className="font-semibold text-gray-700">{quiz.title}</p>
                                     <p className="text-xs text-gray-500">Attempts: {getAttemptsCount(quiz.id)}/3</p>
                                 </div>
                                 <button onClick={() => onTakeQuiz(quiz)} className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 transition-colors disabled:bg-gray-400" disabled={hasTakenQuiz(quiz.id)}>
                                     {hasTakenQuiz(quiz.id) ? 'Completed' : 'Take Quiz'}
                                 </button>
                             </div>
                         )) : (
                             <p className="text-gray-500 text-center py-8">This lesson has no quizzes.</p>
                         )}
                    </div>
                )}
            </div>
        </Modal>
    );
}

const QuizInterface = ({ quiz, onSubmit, onBack }) => {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [selectedOption, setSelectedOption] = useState(null);
    const [isFeedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [feedbackData, setFeedbackData] = useState({ isCorrect: false, correctAnswer: '', explanation: '' });
    const { showToast } = useToast();

    const handleOptionSelect = (optionIndex) => {
        setSelectedOption(optionIndex);
    };

    const handleAnswerSubmit = () => {
        if (selectedOption === null) return;
        
        const currentQuestion = quiz.questions[currentQuestionIndex];
        const isCorrect = currentQuestion.correctOption === selectedOption;
        
        const newAnswers = { ...answers, [currentQuestionIndex]: selectedOption };
        setAnswers(newAnswers);
        
        if (!isCorrect && currentQuestion.explanation) {
            setFeedbackData({
                isCorrect: false,
                correctAnswer: currentQuestion.options[currentQuestion.correctOption],
                explanation: currentQuestion.explanation || "No explanation provided."
            });
            setFeedbackModalOpen(true);
        } else {
            if(isCorrect) showToast("Correct!", "success");
            proceedToNext(newAnswers);
        }
    };
    
    const proceedToNext = (currentAnswers) => {
        setFeedbackModalOpen(false);
        setSelectedOption(null);

        if (currentQuestionIndex < quiz.questions.length - 1) {
            setCurrentQuestionIndex(prevIndex => prevIndex + 1);
        } else {
            // Final submission
            const finalAnswers = quiz.questions.map((_, index) => currentAnswers[index]);
             if (selectedOption !== null) {
                finalAnswers[currentQuestionIndex] = selectedOption;
            }
            onSubmit(finalAnswers, quiz.isLate);
        }
    };

    const handleContinueFromFeedback = () => {
        proceedToNext(answers);
    }
    
    const currentQuestion = quiz.questions[currentQuestionIndex];

    return (
        <>
            <div className="p-4 md:p-6 border rounded-lg bg-white mt-4 shadow-md">
                <button onClick={onBack} className="text-blue-500 hover:underline mb-4 flex items-center">
                    <ChevronLeft size={20} className="mr-1" /> Back
                </button>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 text-gray-800">{quiz.title}</h2>
                <p className="text-gray-600 mb-6 text-md md:text-lg">Question {currentQuestionIndex + 1} of {quiz.questions.length}</p>

                <div className="p-4 md:p-5 border border-gray-200 rounded-lg bg-gray-50">
                    <p className="font-semibold text-lg md:text-xl mb-4 text-gray-800">{currentQuestionIndex + 1}. {currentQuestion.text}</p>
                    <div className="space-y-3">
                        {currentQuestion.options.map((opt, oIndex) => (
                            <label key={oIndex} className={`flex items-center p-3 rounded-md cursor-pointer transition-colors ${selectedOption === oIndex ? 'bg-blue-100 ring-2 ring-blue-400' : 'hover:bg-gray-100'}`}>
                                <input type="radio" name={`question-${currentQuestionIndex}`} checked={selectedOption === oIndex} onChange={() => handleOptionSelect(oIndex)} className="mr-4 text-blue-600 focus:ring-blue-500 scale-125" />
                                <span className="text-md md:text-lg text-gray-700">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <button onClick={handleAnswerSubmit} className="w-full mt-6 bg-blue-500 text-white p-3 rounded-md text-lg hover:bg-blue-600 transition-colors disabled:bg-blue-300" disabled={selectedOption === null}>
                    {currentQuestionIndex < quiz.questions.length - 1 ? 'Next Question' : 'Submit Quiz'}
                </button>
            </div>

            <Modal isOpen={isFeedbackModalOpen} onClose={handleContinueFromFeedback} title="Incorrect Answer">
                <div className="text-gray-800">
                    <p className="font-semibold text-red-600 text-lg mb-2">The correct answer was:</p>
                    <p className="p-3 bg-green-100 text-green-800 rounded-md mb-4">{feedbackData.correctAnswer}</p>
                    <p className="font-semibold mt-4 text-lg mb-2">Explanation:</p>
                    <p className="text-gray-700">{feedbackData.explanation}</p>
                    <button onClick={handleContinueFromFeedback} className="w-full mt-6 bg-blue-500 text-white p-3 rounded-md text-lg hover:bg-blue-600 transition-colors">
                        Continue
                    </button>
                </div>
            </Modal>
        </>
    );
};

const StudentDashboard = ({}) => {
    const { userProfile, logout } = useAuth();
    const [view, setView] = useState('profile'); // Default to profile
    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <header className="bg-white shadow-md p-2 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center">
                     <img src="https://i.ibb.co/XfJ8scGX/1.png" alt="SRCS Logo" className="w-9 h-9 rounded-full mr-2" />
                    <span className="text-blue-600 font-bold text-xl hidden sm:block">SRCS Portal</span>
                </div>
                 <div className="flex items-center space-x-2 sm:space-x-4">
                    <span className="text-gray-700 hidden sm:inline">Welcome, {userProfile?.firstName || ''}</span>
                    <button onClick={logout} className="bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600 transition-colors text-sm flex items-center gap-2">
                        <LogOut size={16} />
                        <span className="hidden sm:inline">Logout</span>
                    </button>
                </div>
            </header>
            <main className="p-4" style={{ paddingBottom: '80px' }}>
                {view === 'profile' && <ProfilePage />}
                {view === 'classes' && <StudentClassesTab />}
                {view === 'lessons' && <StudentLessonsAndQuizzesTab />}
            </main>
             <footer className="fixed bottom-0 left-0 right-0 bg-white shadow-t-md p-2 flex justify-around z-30 border-t">
                <BottomNavItem icon={<User/>} text="Profile" onClick={() => setView('profile')} isActive={view === 'profile'} />
                <BottomNavItem icon={<School/>} text="Classes" onClick={() => setView('classes')} isActive={view === 'classes'} />
                <BottomNavItem icon={<BookOpen/>} text="Assignments" onClick={() => setView('lessons')} isActive={view === 'lessons'} />
            </footer>
        </div>
    );
};

const StudentClassesTab = () => {
    const { user } = useAuth();
    const [enrolledClasses, setEnrolledClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [submissions, setSubmissions] = useState([]);

    useEffect(() => {
        if (!user) return;
        const classesUnsub = onSnapshot(query(collection(db, "classes"), where("students", "array-contains", user.uid)), (snap) => setEnrolledClasses(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const subsUnsub = onSnapshot(query(collection(db, "submissions"), where("studentId", "==", user.uid)), (snap) => setSubmissions(snap.docs.map(d => d.data())));
        return () => { classesUnsub(); subsUnsub(); };
    }, [user]);

    if (selectedClass) {
        return <StudentClassView classData={selectedClass} submissions={submissions} onBack={() => setSelectedClass(null)} />
    }

    return (
        <div>
            <JoinClass studentId={user.uid} onClassJoined={() => {}} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {enrolledClasses.length > 0 ? (
                    enrolledClasses.map(classData => (
                        <div key={classData.id} className="p-6 rounded-lg shadow-md cursor-pointer bg-blue-200 hover:bg-blue-300 transition-colors" onClick={() => setSelectedClass(classData)}>
                            <h3 className="text-xl font-bold text-gray-800 mb-1 truncate">{classData.name}</h3>
                            <p className="text-sm text-blue-700">Class Code: {classData.code}</p>
                        </div>
                    ))
                ) : (
                    <p className="bg-white p-6 rounded-lg shadow-md text-gray-500 text-center sm:col-span-2 lg:col-span-3">You are not enrolled in any classes. Join one to get started.</p>
                )}
            </div>
        </div>
    )
}

const StudentLessonsAndQuizzesTab = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('active');
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewedLessons, setViewedLessons] = useState(new Set());
    const [quizSubmissions, setQuizSubmissions] = useState(new Map());
    const [activeQuiz, setActiveQuiz] = useState(null);
    const [isLessonDetailOpen, setLessonDetailOpen] = useState(false);
    const [selectedLessonForDetail, setSelectedLessonForDetail] = useState(null);
    const { showToast } = useToast();

    useEffect(() => {
        if (!user) return;
    
        const fetchAllContent = async () => {
            setLoading(true);
    
            // Fetch all classes the student is enrolled in
            const classesQuery = query(collection(db, "classes"), where("students", "array-contains", user.uid));
            const classesSnapshot = await getDocs(classesQuery);
            const enrolledClasses = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
            // Fetch all courses to get details later
            const coursesSnapshot = await getDocs(collection(db, "courses"));
            const coursesMap = new Map(coursesSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
    
            // Fetch student's records
            const viewRecordsQuery = query(collection(db, "viewRecords"), where("studentId", "==", user.uid));
            const viewRecordsSnap = await getDocs(viewRecordsQuery);
            const viewedLessonIds = new Set(viewRecordsSnap.docs.map(doc => doc.data().lessonId));
            setViewedLessons(viewedLessonIds);
    
            const submissionsQuery = query(collection(db, "submissions"), where("studentId", "==", user.uid));
            const submissionsSnap = await getDocs(submissionsQuery);
            const submissionsMap = new Map();
            submissionsSnap.docs.forEach(doc => {
                const sub = doc.data();
                if (submissionsMap.has(sub.quizId)) {
                    submissionsMap.get(sub.quizId).push(sub);
                } else {
                    submissionsMap.set(sub.quizId, [sub]);
                }
            });
            setQuizSubmissions(submissionsMap);
    
            // Aggregate all lessons and quizzes
            let tempItems = [];
            const now = new Date();
    
            enrolledClasses.forEach(c => {
                const courseAccess = c.courseAccess || {};
                for (const courseId in courseAccess) {
                    const course = coursesMap.get(courseId);
                    if (!course) continue;
    
                    for (const unitId in courseAccess[courseId].units) {
                        const unit = course.units.find(u => u.id === unitId);
                        if (!unit) continue;
    
                        for (const lessonId in courseAccess[courseId].units[unitId].lessons) {
                            const lessonAccess = courseAccess[courseId].units[unitId].lessons[lessonId];
                            const lesson = unit.lessons.find(l => l.id === lessonId);
                            if (!lesson) continue;
                            
                            const deadline = lessonAccess.availableUntil.toDate();
                            const isOverdue = now > deadline;
                            
                            // Add lesson
                            tempItems.push({ type: 'lesson', ...lesson, courseId: course.id, classId: c.id, className: c.name, courseTitle: course.title, unitTitle: unit.title, deadline, isOverdue });
    
                            // Add quizzes for that lesson
                            lesson.quizzes?.forEach(quiz => {
                                if (lessonAccess.quizzes.includes(quiz.id)) {
                                    tempItems.push({ type: 'quiz', ...quiz, courseId: course.id, lessonTitle: lesson.title, className: c.name, courseTitle: course.title, deadline, isOverdue });
                                }
                            });
                        }
                    }
                }
            });
            setAllItems(tempItems);
            setLoading(false);
        };
    
        fetchAllContent();
    }, [user]);

    const handleLessonClick = (lesson) => {
        firestoreService.recordLessonView(user.uid, lesson.classId, lesson.courseId, lesson.id);
        setSelectedLessonForDetail(lesson);
        setLessonDetailOpen(true);
        // Optimistically mark as viewed in the UI
        setViewedLessons(prev => new Set(prev).add(lesson.id));
    };

    const handleTakeQuiz = async (answers, isLate) => {
        try {
            const result = await firestoreService.submitQuiz(user.uid, activeQuiz.courseId, activeQuiz.id, answers, isLate);
            showToast(`Quiz submitted! Score: ${result.score}/${result.totalQuestions}`);
            // Optimistically update submissions map
            const newSubmission = { ...result, quizId: activeQuiz.id };
            setQuizSubmissions(prev => {
                const newMap = new Map(prev);
                const existing = newMap.get(activeQuiz.id) || [];
                newMap.set(activeQuiz.id, [...existing, newSubmission]);
                return newMap;
            });
            setActiveQuiz(null);
        } catch (error) {
            showToast(error.message, 'error');
            setActiveQuiz(null);
        }
    };

    const getAttemptsCount = (quizId) => {
        return quizSubmissions.get(quizId)?.length || 0;
    };

    const isCompleted = (item) => {
        if (item.type === 'lesson') return viewedLessons.has(item.id);
        if (item.type === 'quiz') return getAttemptsCount(item.id) >= 3;
        return false;
    };

    const activeItems = allItems.filter(item => !isCompleted(item) && !item.isOverdue);
    const completedItems = allItems.filter(item => isCompleted(item));
    const overdueItems = allItems.filter(item => !isCompleted(item) && item.isOverdue);

    if (activeQuiz) {
        return <QuizInterface quiz={activeQuiz} onSubmit={handleTakeQuiz} onBack={() => setActiveQuiz(null)} />
    }

    const renderItems = (items) => {
        if (items.length === 0) {
            return <p className="text-gray-500 text-center py-8">No items in this category.</p>;
        }
        return items.map((item, index) => {
            const attempts = item.type === 'quiz' ? getAttemptsCount(item.id) : 0;
            const maxAttemptsReached = attempts >= 3;

            return (
                <div key={`${item.id}-${index}`} className="bg-white p-4 rounded-lg shadow-md mb-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className={`font-bold text-lg ${item.type === 'quiz' ? 'text-purple-700' : 'text-blue-700'}`}>{item.title}</p>
                            <p className="text-sm text-gray-600">{item.courseTitle} / {item.unitTitle || item.lessonTitle}</p>
                            <p className="text-xs text-gray-500">Class: {item.className}</p>
                        </div>
                        {item.type === 'lesson' ? (
                            <button onClick={() => handleLessonClick(item)} className="bg-blue-500 text-white px-3 py-1 rounded-md text-sm">View</button>
                        ) : (
                            <button 
                                onClick={() => setActiveQuiz({...item, isLate: item.isOverdue, courseId: item.courseId})} 
                                className={`px-3 py-1 rounded-md text-sm ${maxAttemptsReached ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-purple-500 text-white hover:bg-purple-600'}`}
                                disabled={maxAttemptsReached}
                            >
                                {maxAttemptsReached ? 'Completed' : 'Take Quiz'} ({attempts}/3)
                            </button>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">Due: {item.deadline.toLocaleString()}</div>
                </div>
            );
        });
    };

    return (
        <div>
            <div className="flex border-b border-gray-200 mb-4">
                <button onClick={() => setActiveTab('active')} className={`py-2 px-4 flex-1 text-center font-semibold ${activeTab === 'active' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}>Active</button>
                <button onClick={() => setActiveTab('completed')} className={`py-2 px-4 flex-1 text-center font-semibold ${activeTab === 'completed' ? 'border-b-2 border-green-500 text-green-600' : 'text-gray-500'}`}>Completed</button>
                <button onClick={() => setActiveTab('overdue')} className={`py-2 px-4 flex-1 text-center font-semibold ${activeTab === 'overdue' ? 'border-b-2 border-red-500 text-red-600' : 'text-gray-500'}`}>Overdue</button>
            </div>
            {loading ? <Spinner /> : (
                <div>
                    {activeTab === 'active' && renderItems(activeItems)}
                    {activeTab === 'completed' && renderItems(completedItems)}
                    {activeTab === 'overdue' && renderItems(overdueItems)}
                </div>
            )}
            {isLessonDetailOpen && (
                <StudentLessonDetailModal 
                    isOpen={isLessonDetailOpen} 
                    onClose={() => setLessonDetailOpen(false)} 
                    lesson={selectedLessonForDetail} 
                    onTakeQuiz={(quiz) => {
                        setActiveQuiz({...quiz, isLate: quiz.isOverdue, courseId: selectedLessonForDetail.courseId}); 
                        setLessonDetailOpen(false)
                    }} 
                    hasTakenQuiz={(quizId) => getAttemptsCount(quizId) >= 3} 
                    getAttemptsCount={getAttemptsCount}
                />
            )}
        </div>
    );
};

const StudentClassView = ({ classData, submissions, onBack }) => {
    // This component remains for drilling down into a specific class, but the main "Lessons & Quizzes" tab aggregates content.
    // The logic can be simplified or adapted as needed.
    return (
        <div>
            <button onClick={onBack} className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors m-4">
                ← Back to Classes
            </button>
            <div className="p-4">
                <h2 className="text-2xl font-bold">{classData.name}</h2>
                <p className="mt-4 text-gray-600">Content for this class is now available in the "Assignments" tab.</p>
            </div>
        </div>
    );
};
const JoinClass = ({ studentId, onClassJoined }) => {
    const [classCode, setClassCode] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!classCode.trim()) return;
        setIsSubmitting(true);
        try {
            await firestoreService.joinClass(studentId, classCode);
            showToast("Successfully joined class!");
            setClassCode('');
            if(onClassJoined) onClassJoined();
        } catch (err) {
            setError(err.message);
            showToast(err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-gray-50 shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-gray-800">Join a New Class</h3>
             {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={classCode}
                    onChange={(e) => setClassCode(e.target.value)}
                    placeholder="Enter Class Code"
                    className="flex-grow p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                />
                <button type="submit" disabled={isSubmitting} className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors disabled:bg-blue-300">
                    {isSubmitting ? 'Joining...' : 'Join'}
                </button>
            </div>
        </form>
    );
};
const StudentScores = ({ studentId }) => <div className="bg-white p-4 rounded-lg shadow"><h3>My Scores</h3><p>No scores yet.</p></div>;
const ProfilePage = ({ onBack }) => {
    const { user, userProfile, refreshUserProfile } = useAuth();
    const { showToast } = useToast();
    const [profile, setProfile] = useState({ firstName: '', lastName: '', gender: '' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userProfile) {
            setProfile({
                firstName: userProfile.firstName || '',
                lastName: userProfile.lastName || '',
                gender: userProfile.gender || 'Not specified'
            });
        }
        setLoading(false);
    }, [userProfile]);
    
    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        try {
            await firestoreService.updateUserProfile(user.uid, profile);
            await refreshUserProfile();
            showToast("Profile updated successfully!");
        } catch (error) {
            showToast("Failed to update profile.", "error");
            console.error(error);
        }
    };
    
    if (loading) return <Spinner />;

    return (
        <div className="w-full max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">My Profile</h2>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <input type="text" value={profile.firstName} onChange={e => setProfile({...profile, firstName: e.target.value})} className="mt-1 block w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input type="text" value={profile.lastName} onChange={e => setProfile({...profile, lastName: e.target.value})} className="mt-1 block w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700">Gender</label>
                    <select value={profile.gender} onChange={e => setProfile({...profile, gender: e.target.value})} className="mt-1 block w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="Not specified">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-md hover:bg-blue-700 transition-colors">Save Profile</button>
            </form>
        </div>
    )
}
const AdminDashboard = () => <div className="p-4"><h1>Admin Dashboard</h1></div>

// --- App Router ---
const AppRouter = () => {
    const { user, userProfile, loading } = useAuth();

    // Dynamically load Tailwind Typography and SheetJS for Excel export
    useEffect(() => {
        const typographyLink = document.createElement('link');
        typographyLink.rel = 'stylesheet';
        typographyLink.href = 'https://cdn.jsdelivr.net/npm/@tailwindcss/typography@0.5.x/dist/typography.min.css';
        document.head.appendChild(typographyLink);

        const xlsxScript = document.createElement('script');
        xlsxScript.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
        xlsxScript.async = true;
        document.body.appendChild(xlsxScript);

        return () => { 
            document.head.removeChild(typographyLink);
            // It's generally safe to leave the script tag, but you could remove it if needed.
        };
    }, []);

    if (loading) return <Spinner />;
    if (!user) return <LoginPage />;
    
    if (userProfile?.role === 'teacher' || userProfile?.role === 'admin') return <TeacherDashboard />;
    if (userProfile?.role === 'student') return <StudentDashboard />;
    
    return <Spinner />; // Fallback while profile is loading or for unknown roles
};


export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <AppRouter />
            </ToastProvider>
        </AuthProvider>
    );
}
