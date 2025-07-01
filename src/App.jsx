import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminConsole from './pages/AdminConsole';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/admin-console" element={<AdminConsole />} />
    </Routes>
  );
};

export default App;
