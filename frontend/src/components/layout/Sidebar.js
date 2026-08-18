import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import api from '../../services/api';
import { MODULES, mergeMenu } from '../../config/menuConfig';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, hasModuleAccess, logout } = useAuth();

  const [expandedSection, setExpandedSection] = useState(null);
  const [menu, setMenu] = useState(() => mergeMenu(null));
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.get('/menu-config')
      .then((r) => { if (mounted) setMenu(mergeMenu(r.data.config)); })
      .catch(() => {});
    const onUpdate = () => api.get('/menu-config').then((r) => setMenu(mergeMenu(r.data.config))).catch(() => {});
    const loadBranding = () => api.get('/settings').then((r) => { if (mounted) setBranding(r.data); }).catch(() => {});
    loadBranding();
    window.addEventListener('menu-config-updated', onUpdate);
    window.addEventListener('company-settings-updated', loadBranding);
    return () => {
      mounted = false;
      window.removeEventListener('menu-config-updated', onUpdate);
      window.removeEventListener('company-settings-updated', loadBranding);
    };
  }, []);

  const toggleSection = (section) => setExpandedSection((prev) => (prev === section ? null : section));

  // Auto-expand the section containing the active route
  useEffect(() => {
    if (!location?.pathname) return;
    const owner = menu.find((s) => !s.standalone && s.items?.some((it) => {
      const mod = MODULES[it.id];
      return mod && location.pathname.startsWith(mod.path);
    }));
    if (owner && expandedSection !== owner.id) setExpandedSection(owner.id);
    // eslint-disable-next-line
  }, [location?.pathname, menu]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const renderItem = (item) => {
    const mod = MODULES[item.id];
    if (!mod || item.hidden) return null;
    const accessId = mod.moduleId || item.id; // shortcuts check the underlying module
    if (mod.requiresAdmin && currentUser?.role !== 'Administrator') return null;
    if (!(mod.alwaysShow || hasModuleAccess(accessId))) return null;
    const Icon = mod.icon;
    const isActive = location.pathname === mod.path;
    return (
      <Button
        key={item.id}
        variant={isActive ? 'secondary' : 'ghost'}
        className={`w-full justify-start ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
        onClick={() => navigate(mod.path)}
        data-testid={`nav-${item.id}`}
      >
        <Icon className="mr-3 h-5 w-5" />
        {item.label || mod.label}
      </Button>
    );
  };

  const renderSection = (section) => {
    if (section.hidden) return null;
    if (section.standalone) {
      return section.items.map((it) => renderItem(it));
    }
    const visible = section.items.map((it) => renderItem(it)).filter(Boolean);
    if (visible.length === 0) return null;
    const isExpanded = expandedSection === section.id;
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
    return (
      <div key={section.id} className="mb-2">
        <button
          onClick={() => toggleSection(section.id)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider"
          data-testid={`nav-section-${section.id}`}
        >
          {section.label}
          <ChevronIcon className="h-4 w-4" />
        </button>
        {isExpanded && <div className="space-y-1 mt-1">{visible}</div>}
      </div>
    );
  };

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-screen">
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3" data-testid="sidebar-branding">
          <img
            src={branding?.company_logo_url || 'https://customer-assets.emergentagent.com/job_a1a2f0e6-9ded-40ed-8f0a-dad072e43824/artifacts/8jhy6uh1_image.png'}
            alt="Company Logo"
            className="w-10 h-10 object-contain rounded"
            data-testid="sidebar-logo"
          />
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-snug" data-testid="sidebar-company-name">
              {(branding?.company_name && branding.company_name !== 'Your Company Name') ? branding.company_name : 'Nestix'}
            </h1>
            <p className="text-xs text-slate-400 leading-tight mt-0.5" data-testid="sidebar-tagline">
              {branding?.company_tagline || 'Optimize Your Operations'}
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {menu.map((section) => renderSection(section))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-slate-700">
        <div className="mb-3 px-2">
          <p className="text-sm font-medium">{currentUser?.name}</p>
          <p className="text-xs text-slate-400">{currentUser?.role}</p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-300 hover:bg-slate-800 hover:text-white"
          onClick={handleLogout}
        >
          <LogOut className="mr-3 h-5 w-5" />
          Logout
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
