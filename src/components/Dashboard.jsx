import React, { useState } from 'react';
import {
    BarChart3,
    FilePlus2,
    PlaySquare,
    Menu,
    X,
    LogOut,
    Settings as SettingsIcon,
    Bell,
    Search,
    User
} from 'lucide-react';
import NewAuditForm from './NewAuditForm';
import Settings from './Settings';
import Progression from './Progression';

const Layout = ({ user, onLogout }) => {
    const [activeTab, setActiveTab] = useState(() => {
        return sessionStorage.getItem('activeTab') || 'new-audit';
    });
    const [isSidebarOpen, setSidebarOpen] = useState(false); // Closed by default on mobile

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        sessionStorage.setItem('activeTab', tabId);
    };

    const menuItems = [
        { id: 'new-audit', label: 'Nouvel audit', icon: FilePlus2 },
        { id: 'slides', label: 'Slides', icon: PlaySquare },
        { id: 'progression', label: 'Progression', icon: BarChart3 },
        { id: 'settings', label: 'Paramètres', icon: SettingsIcon },
    ];

    return (
        <div className="min-h-screen bg-slate-950 flex text-slate-100 overflow-hidden relative">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out flex flex-col glass border-r border-white/5
                    ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0 lg:w-20'}
                    lg:relative lg:translate-x-0`}
            >
                <div className="p-6 flex items-center justify-between">
                    {(isSidebarOpen || !isSidebarOpen) && (
                        <div className={`flex items-center gap-3 ${!isSidebarOpen && 'lg:hidden'}`}>
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                <span className="font-bold text-white">S</span>
                            </div>
                            <span className="font-bold text-xl tracking-tight leading-none">Smart Audit</span>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarOpen(!isSidebarOpen)}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-2 flex flex-col items-center">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    handleTabChange(item.id);
                                    if (window.innerWidth < 1024) setSidebarOpen(false);
                                }}
                                className={`w-full flex items-center p-3 rounded-xl transition-all duration-200 group relative ${isActive
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                    } ${!isSidebarOpen ? 'justify-center lg:w-12 lg:h-12' : 'gap-4'}`}
                            >
                                <Icon
                                    size={24}
                                    className={`${isActive ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-300 shrink-0`}
                                />
                                {isSidebarOpen && (
                                    <span className="font-medium whitespace-nowrap overflow-hidden transition-all duration-300">
                                        {item.label}
                                    </span>
                                )}
                                {!isSidebarOpen && (
                                    <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                                        {item.label}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/5 flex justify-center">
                    <button
                        onClick={onLogout}
                        className={`flex items - center rounded - xl text - red - 400 hover: bg - red - 500 / 10 transition - all font - medium ${!isSidebarOpen ? 'lg:w-12 lg:h-12 justify-center' : 'w-full gap-4 p-3'} `}
                        title="Déconnexion"
                    >
                        <LogOut size={22} className="shrink-0" />
                        {isSidebarOpen && <span>Déconnexion</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative overflow-auto">
                {/* Top Navbar */}
                <header className="h-20 lg:h-16 flex items-center justify-between px-4 lg:px-8 border-b border-white/5 glass sticky top-0 z-30 gap-4">
                    <div className="flex items-center lg:hidden mr-2">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"
                        >
                            <Menu size={24} />
                        </button>
                    </div>

                    <div className="flex-1 max-w-xl">
                        <div className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-xl group focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                            <Search size={18} className="text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                className="bg-transparent border-none outline-none text-sm w-full placeholder:text-slate-600 text-white"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-6">
                        <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
                            <Bell size={20} />
                            <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-slate-950" />
                        </button>

                        <div className="flex items-center gap-3 pl-2 lg:pl-6 border-l border-white/5">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold whitespace-nowrap">Admin Flowcraft</p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-tighter">Administrateur</p>
                            </div>
                            <div className="w-9 h-9 lg:w-10 lg:h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full flex items-center justify-center border-2 border-slate-800 shadow-xl overflow-hidden shrink-0">
                                <User size={18} />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <section className="p-4 lg:p-8">
                    <div className="mb-6 lg:mb-8">
                        <h2 className="text-xl lg:text-2xl font-bold mb-2">
                            {menuItems.find(i => i.id === activeTab)?.label}
                        </h2>
                        <div className="h-1 w-16 lg:w-20 bg-blue-600 rounded-full" />
                    </div>

                    <div className="glass rounded-2xl p-4 lg:p-8 border border-white/5 relative overflow-hidden min-h-[calc(100vh-12rem)]">
                        {activeTab === 'new-audit' && <NewAuditForm onAuditSuccess={() => handleTabChange('progression')} />}
                        {activeTab === 'slides' && <div className="py-20 text-center text-slate-500 italic">Section Slides en cours de développement...</div>}
                        {activeTab === 'progression' && <Progression />}
                        {activeTab === 'settings' && <Settings />}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default Layout;
