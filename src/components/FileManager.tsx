import React, { useState, useEffect } from 'react';
import { Folder, File, Download, Trash2, LogOut, Search, Calendar, HardDrive } from 'lucide-react';

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

export const FileManager: React.FC<FileManagerProps> = ({ onLogout }) => {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Simulate loading files from disk
  useEffect(() => {
    const loadFiles = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/files');
        const data = await response.json();
        setFiles(data);
      } catch (error) {
        console.error('Error loading files:', error);
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
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('presentation') || type.includes('powerpoint')) return '📋';
    if (type.includes('zip') || type.includes('archive')) return '📦';
    if (type.includes('video')) return '🎥';
    if (type.includes('audio')) return '🎵';
    return '📁';
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);

  const handleDownload = (file: StoredFile) => {
    // Create a temporary link to trigger download
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading files...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 p-3 rounded-xl">
                <Folder className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">File Manager</h1>
                <p className="text-gray-600">Manage uploaded files</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 p-3 rounded-lg">
                <File className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{files.length}</p>
                <p className="text-gray-600">Total Files</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 p-3 rounded-lg">
                <HardDrive className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatFileSize(totalSize)}</p>
                <p className="text-gray-600">Total Size</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center space-x-3">
              <div className="bg-purple-100 p-3 rounded-lg">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{selectedFiles.size}</p>
                <p className="text-gray-600">Selected</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {selectedFiles.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Selected ({selectedFiles.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* File List */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {filteredFiles.length === 0 ? (
            <div className="p-12 text-center">
              <File className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No files found</h3>
              <p className="text-gray-600">
                {searchTerm ? 'Try adjusting your search terms' : 'No files have been uploaded yet'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
                          } else {
                            setSelectedFiles(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-900">Name</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-900">Size</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-900">Upload Date</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleFileSelection(file.id)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{getFileIcon(file.type)}</span>
                          <div>
                            <p className="font-medium text-gray-900">{file.name}</p>
                            <p className="text-sm text-gray-500">{file.type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatFileSize(file.size)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(file.uploadDate)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(file.id)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};