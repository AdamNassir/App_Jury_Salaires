import React from 'react';

export function AuthErrorNotice({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-left text-sm text-red-800">
      <p className="font-bold">{title}</p>
      <p className="mt-2 whitespace-pre-wrap break-words">{message}</p>
    </div>
  );
}
