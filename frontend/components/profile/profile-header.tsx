import React from 'react'

export default function ProfileHeader() {

  return (
    <div className="z-20 flex-none h-14 w-full">
      <header className="flex w-full h-14 items-center m-auto border-b">
        <div className="flex items-center w-full">
          <div className="flex-grow flex items-center mx-4 space-x-4">
            <h1 className="font-medium">Profile</h1>
          </div>
          <div className="p-8 ml-auto">
          </div>
        </div>
      </header>
    </div>
  )
};
