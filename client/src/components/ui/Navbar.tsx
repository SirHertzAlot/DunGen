import { NavLink } from 'react-router-dom';

export function Navbar() {
  const navItems = [
    { name: 'Dashboard', path: '/' },
    { name: 'Heightmap Viewer', path: '/heightmap-viewer' },
    { name: 'Settings', path: '/settings' },
    { name: 'World Viewer', path: '/world-viewer' }, // Added World Viewer
  ];

  return (
    <nav className="bg-gray-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <span className="text-xl font-bold">DunGen</span>
            <div className="ml-10 flex items-baseline space-x-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md text-sm font-medium ${
                      isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`
                  }
                >
                  {item.name}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
