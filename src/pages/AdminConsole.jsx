
import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';

const generatePassword = () => Math.random().toString(36).slice(-8);

const AdminConsole = () => {
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({ email: '', firstName: '', lastName: '', role: 'student' });

  const fetchUsers = async () => {
    const querySnapshot = await getDocs(collection(db, "users"));
    const usersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setUsers(usersData);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    const newId = formData.email.replace('@srcs.edu', '').replace(/[^a-zA-Z0-9]/g, '');
    const password = generatePassword();
    await setDoc(doc(db, "users", newId), { ...formData, password });
    alert(`User created with password: ${password}`);
    fetchUsers();
    setFormData({ email: '', firstName: '', lastName: '', role: 'student' });
  };

  const handleDeleteUser = async (id) => {
    await deleteDoc(doc(db, "users", id));
    fetchUsers();
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin Console</h1>
      <form onSubmit={handleAddUser} className="mb-6 bg-gray-100 p-4 rounded">
        <input name="email" value={formData.email} onChange={handleInputChange} placeholder="Email (e.g., user01@srcs.edu)" className="w-full mb-2 p-2 border rounded" required />
        <input name="firstName" value={formData.firstName} onChange={handleInputChange} placeholder="First Name" className="w-full mb-2 p-2 border rounded" required />
        <input name="lastName" value={formData.lastName} onChange={handleInputChange} placeholder="Last Name" className="w-full mb-2 p-2 border rounded" required />
        <select name="role" value={formData.role} onChange={handleInputChange} className="w-full mb-2 p-2 border rounded">
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>
        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded">Add User</button>
      </form>
      <h2 className="text-xl font-semibold mb-2">User List</h2>
      <ul className="space-y-2">
        {users.map(user => (
          <li key={user.id} className="bg-white p-3 shadow rounded flex justify-between items-center">
            <span>{user.email} - {user.role}</span>
            <button onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:text-red-700">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminConsole;
