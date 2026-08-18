import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Badge } from '../ui/badge';
import api from '../../services/api';

const NotificationBell = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    fetchUnreadCount();
    // Check for new notifications every minute
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const response = await api.get('/notifications/unread-count');
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications/', { params: { limit: 10 } });
      setNotifications(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const handleBellClick = () => {
    setShowDropdown(!showDropdown);
    if (!showDropdown) {
      fetchNotifications();
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/mark-read`);
      fetchUnreadCount();
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      fetchUnreadCount();
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-600';
      case 'high': return 'text-orange-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-blue-600';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleBellClick}
        className="relative p-2 rounded-full hover:bg-slate-100"
      >
        <Bell className="w-6 h-6 text-slate-600" />
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            variant="destructive"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border z-50 max-h-[500px] overflow-y-auto">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-sm text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="divide-y">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-slate-50 cursor-pointer ${
                    !notification.read ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => {
                    if (!notification.read) markAsRead(notification.id);
                    if (notification.link) window.location.href = notification.link;
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className={`font-semibold ${getPriorityColor(notification.priority)}`}>
                        {notification.title}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {notification.message}
                      </div>
                      <div className="text-xs text-slate-400 mt-2">
                        {new Date(notification.created_at).toLocaleString()}
                      </div>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-blue-600 rounded-full ml-2 mt-1" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-2 border-t text-center">
              <button
                onClick={() => window.location.href = '/notifications'}
                className="text-sm text-blue-600 hover:underline"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
