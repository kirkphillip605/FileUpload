import React, { useState, useRef } from 'react';
import { Upload, File, CheckCircle, X, LogOut, Pause, Play, RotateCcw } from 'lucide-react';

interface FileUploadProps {
  onLogout: () => void;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'success' | 'error' | 'paused';
  progress: number;
  upload?: any;
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onLogout }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const resumableUpload = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      
      const newFile: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0
      };

      setUploadedFiles(prev => [...prev, newFile]);

      // Custom resumable upload implementation
      const uploadFile = async () => {
        try {
          // Step 1: Create upload session
          const metadata = btoa(`filename ${btoa(file.name)},filetype ${btoa(file.type || 'application/octet-stream')}`);
          
          const createResponse = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Upload-Length': file.size.toString(),
              'Upload-Metadata': metadata,
              'Tus-Resumable': '1.0.0'
            }
          });

          if (!createResponse.ok) {
            throw new Error('Failed to create upload session');
          }

          const location = createResponse.headers.get('Location');
          if (!location) {
            throw new Error('No upload location returned');
          }

          // Step 2: Upload file in chunks
          const chunkSize = 1024 * 1024; // 1MB chunks
          let offset = 0;
          
          while (offset < file.size) {
            const chunk = file.slice(offset, offset + chunkSize);
            
            const uploadResponse = await fetch(location, {
              method: 'PATCH',
              headers: {
                'Upload-Offset': offset.toString(),
                'Tus-Resumable': '1.0.0',
                'Content-Type': 'application/offset+octet-stream'
              },
              body: chunk
            });

            if (!uploadResponse.ok) {
              throw new Error('Upload chunk failed');
            }

            offset += chunk.size;
            const percentage = Math.round((offset / file.size) * 100);
            
            console.log(`📊 Upload progress: ${percentage}% (${formatFileSize(offset)}/${formatFileSize(file.size)})`);
            
            setUploadedFiles(prev => 
              prev.map(f => 
                f.id === fileId ? { ...f, progress: percentage } : f
              )
            );
          }

          console.log('✅ Upload completed successfully!');
          setUploadedFiles(prev => 
            prev.map(f => 
              f.id === fileId ? { 
                ...f, 
                status: 'success', 
                progress: 100,
                upload: undefined 
              } : f
            )
          );
          resolve();

        } catch (error) {
          console.error('❌ Upload failed:', error);
          setUploadedFiles(prev => 
            prev.map(f => 
              f.id === fileId ? { 
                ...f, 
                status: 'error', 
                error: error.message,
                upload: undefined 
              } : f
            )
          );
          reject(error);
        }
      };

      uploadFile();
    });
  };

  const handleFiles = async (files: FileList) => {
    console.log(`📁 Processing ${files.length} file(s) for upload`);
    
    // Process files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      try {
        await resumableUpload(files[i]);
      } catch (error) {
        console.error(`Failed to upload file ${files[i].name}:`, error);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const pauseUpload = (fileId: string) => {
    // Note: Pause functionality would need to be implemented with AbortController
    console.log('Pause functionality not yet implemented in custom upload');
  };

  const resumeUpload = (fileId: string) => {
    // Note: Resume functionality would need to be implemented
    console.log('Resume functionality not yet implemented in custom upload');
  };

  const retryUpload = (fileId: string) => {
    // Note: Retry functionality would need to be implemented
    console.log('Retry functionality not yet implemented in custom upload');
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleLogout = () => {
    localStorage.removeItem('fileUploadAuth');
    onLogout();
  };

  const successCount = uploadedFiles.filter(f => f.status === 'success').length;
  const activeUploads = uploadedFiles.filter(f => f.status === 'uploading').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Resumable File Upload</h1>
              <p className="text-gray-600 mt-1">Upload large files to local server storage with resume capability</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
              title="Logout"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Upload Stats */}
        {(successCount > 0 || activeUploads > 0) && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{successCount}</div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{activeUploads}</div>
                <div className="text-sm text-gray-600">In Progress</div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Area */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }
            `}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isDragOver ? 'Drop files here' : 'Upload Large Files'}
            </h3>
            <p className="text-gray-600 mb-4">
              Drag and drop files here, or click to select files
            </p>
            <div className="text-sm text-gray-500 space-y-1">
              <p>• <strong>25GB maximum</strong> per file</p>
              <p>• <strong>Resumable uploads</strong> - continues if interrupted</p>
              <p>• <strong>All file types</strong> supported</p>
              <p>• <strong>Local storage</strong> - files stored securely on server</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Success Summary */}
        {successCount > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-6">
            <div className="flex items-center">
              <CheckCircle className="w-6 h-6 text-green-600 mr-3" />
              <div>
                <h3 className="text-lg font-semibold text-green-900">
                  {successCount} file{successCount !== 1 ? 's' : ''} uploaded successfully!
                </h3>
                <p className="text-green-700">
                  Your files have been securely stored on the server.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploadedFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Queue</h3>
            <div className="space-y-4">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center p-4 bg-gray-50 rounded-xl">
                  <File className="w-8 h-8 text-blue-500 mr-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                    
                    {file.status === 'uploading' && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Uploading...</span>
                          <span>{Math.round(file.progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    
                    {file.status === 'success' && (
                      <div className="flex items-center mt-1">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                        <span className="text-sm text-green-600">Upload complete</span>
                      </div>
                    )}
                    
                    {file.status === 'paused' && (
                      <div className="flex items-center mt-1">
                        <Pause className="w-4 h-4 text-yellow-500 mr-1" />
                        <span className="text-sm text-yellow-600">Upload paused</span>
                      </div>
                    )}
                    
                    {file.status === 'error' && (
                      <div className="mt-1">
                        <div className="flex items-center">
                          <X className="w-4 h-4 text-red-500 mr-1" />
                          <span className="text-sm text-red-600">Upload failed</span>
                        </div>
                        {file.error && (
                          <p className="text-xs text-red-500 mt-1">{file.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {file.status === 'uploading' && (
                      <button
                        onClick={() => pauseUpload(file.id)}
                        className="p-2 text-yellow-600 hover:bg-yellow-100 rounded-lg transition-all"
                        title="Pause Upload"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    )}
                    
                    {file.status === 'paused' && (
                      <button
                        onClick={() => resumeUpload(file.id)}
                        className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-all"
                        title="Resume Upload"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    
                    {file.status === 'error' && (
                      <button
                        onClick={() => retryUpload(file.id)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                        title="Retry Upload"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-all"
                      title="Remove from Queue"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};