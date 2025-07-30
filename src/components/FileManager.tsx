import React, { useState, useEffect } from 'react';
import { 
  Folder, File, Download, Trash2, LogOut, Search, Calendar, HardDrive, 
  Grid, List, MoreVertical, Smartphone, Filter, SortAsc 
} from 'lucide-react';

interface FileManagerProps {
  onLogout: () => void;
}

interface StoredFile {
  id: string;
  name: string;
  size: number;
  uploadDate: string;
  type: string;
  path: string;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'size' | 'date';

export const FileManager: React.FC<FileManagerProps> = ({ onLogout }) => {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [showActions, setShowActions] = useState<string | null>(null);

  // Load files from server storage via API
  useEffect(() => {
    const loadFiles = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/files');
        const data = await response.json();
        setFiles(data);
      } catch (error) {
        console.error('❌ Error loading files:', error);
        setFiles([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadFiles();
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const getFileIcon = (type: string, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClass = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl';
    
    if (type.startsWith('image/')) return <span className={sizeClass}>🖼️</span>;
    if (type.includes('pdf')) return <span className={sizeClass}>📄</span>;
    if (type.includes('word') || type.includes('document')) return <span className={sizeClass}>📝</span>;
    if (type.includes('sheet') || type.includes('excel')) return <span className={sizeClass}>📊</span>;
    if (type.includes('presentation') || type.includes('powerpoint')) return <span className={sizeClass}>📋</span>;
    if (type.includes('zip') || type.includes('archive')) return <span className={sizeClass}>📦</span>;
    if (type.includes('video')) return <span className={sizeClass}>🎥</span>;
    if (type.includes('audio')) return <span className={sizeClass}>🎵</span>;
    return <span className={sizeClass}>📁</span>;
  };

  const sortFiles = (files: StoredFile[]) => {
    return [...files].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        case 'date':
          return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
        default:
          return 0;
      }
    });
  };

  const filteredFiles = sortFiles(
    files.filter(file =>
      file.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);

  const handleDownload = (file: StoredFile) => {
    const link = document.createElement('a');
    link.href = file.path;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      try {
        const response = await fetch(`/api/files/${fileId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setFiles(prev => prev.filter(f => f.id !== fileId));
          setSelectedFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(fileId);
            return newSet;
          });
        } else {
          alert('Failed to delete file');
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file');
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('fileUploadAuth');
    onLogout();
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedFiles.size} selected file(s)?`)) {
      try {
        const deletePromises = Array.from(selectedFiles).map(fileId => 
          fetch(`/api/files/${fileId}`, { method: 'DELETE' })
        );
        
        await Promise.all(deletePromises);
        
        setFiles(prev => prev.filter(f => !selectedFiles.has(f.id)));
        setSelectedFiles(new Set());
      } catch (error) {
        console.error('Bulk delete error:', error);
        alert('Failed to delete some files');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-3 py-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Mobile-optimized header */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 sm:p-4 rounded-xl shadow-lg flex-shrink-0">
                <Folder className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">
                  File Manager
                </h1>
                <p className="text-gray-600 text-sm sm:text-base mt-1 leading-tight">
                  Manage your uploaded files
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 sm:px-4 sm:py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all touch-manipulation flex-shrink-0"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile-optimized stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-6">
          <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="bg-green-100 p-2 sm:p-3 rounded-lg flex-shrink-0">
                <File className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{files.length}</p>
                <p className="text-xs sm:text-sm text-gray-600 truncate">Total Files</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="bg-blue-100 p-2 sm:p-3 rounded-lg flex-shrink-0">
                <HardDrive className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{formatFileSize(totalSize)}</p>
                <p className="text-xs sm:text-sm text-gray-600 truncate">Storage Used</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-3 sm:p-6 col-span-2 sm:col-span-1">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="bg-purple-100 p-2 sm:p-3 rounded-lg flex-shrink-0">
                <Calendar className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{selectedFiles.size}</p>
                <p className="text-xs sm:text-sm text-gray-600 truncate">Selected</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile-optimized search and controls */}
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 sm:py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base sm:text-sm"
              />
            </div>
            
            {/* Controls */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                {/* View mode toggle */}
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded transition-all touch-manipulation ${
                      viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600'
                    }`}
                    aria-label="Grid view"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded transition-all touch-manipulation ${
                      viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600'
                    }`}
                    aria-label="List view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="date">Date</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
              </div>
              
              {/* Actions */}
              {selectedFiles.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Delete ({selectedFiles.size})</span>
                  <span className="sm:hidden">{selectedFiles.size}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile-optimized file display */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-lg overflow-hidden">
          {filteredFiles.length === 0 ? (
            <div className="p-8 sm:p-12 text-center">
              <div className="bg-gray-100 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <File className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No files found</h3>
              <p className="text-gray-600 text-sm sm:text-base">
                {searchTerm ? 'Try adjusting your search terms' : 'No files have been uploaded yet'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid view for mobile */
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    className="bg-gray-50 rounded-xl p-3 sm:p-4 transition-all hover:shadow-md relative group"
                  >
                    {/* Selection checkbox */}
                    <div className="absolute top-2 left-2 z-10">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 w-4 h-4 touch-manipulation"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                      />
                    </div>
                    
                    {/* File icon */}
                    <div className="text-center mb-3">
                      {getFileIcon(file.type, 'lg')}
                    </div>
                    
                    {/* File info */}
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900 text-xs sm:text-sm truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(file.uploadDate)}
                      </p>
                    </div>
                    
                    {/* Actions */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="relative">
                        <button
                          onClick={() => setShowActions(showActions === file.id ? null : file.id)}
                          className="p-1 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-all touch-manipulation"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                        
                        {showActions === file.id && (
                          <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 min-w-32">
                            <button
                              onClick={() => {
                                handleDownload(file);
                                setShowActions(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download</span>
                            </button>
                            <button
                              onClick={() => {
                                handleDelete(file.id);
                                setShowActions(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* List view for mobile */
            <div className="divide-y divide-gray-200">
              {filteredFiles.map((file) => (
                <div key={file.id} className="p-4 hover:bg-gray-50 transition-all">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 touch-manipulation"
                      checked={selectedFiles.has(file.id)}
                      onChange={() => toggleFileSelection(file.id)}
                    />
                    
                    <div className="flex-shrink-0">
                      {getFileIcon(file.type, 'md')}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm sm:text-base">
                        {file.name}
                      </p>
                      <div className="flex items-center space-x-2 sm:space-x-4 text-xs sm:text-sm text-gray-500 mt-1">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{formatDate(file.uploadDate)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all touch-manipulation"
                        aria-label="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(file.id)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all touch-manipulation"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};