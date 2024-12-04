import React from 'react';

import { cn } from '@/lib/utils';

import { Tag, TagProps } from './tag';
import { type Tag as TagType } from './tag-input';

export type TagListProps = {
  tags: TagType[];
  customTagRenderer?: (tag: TagType) => React.ReactNode;
  direction?: TagProps['direction'];
} & Omit<TagProps, 'tagObj'>;

export const TagList: React.FC<TagListProps> = ({
  tags,
  customTagRenderer,
  direction,
  ...tagProps
}) => (
  <div
    className={cn('rounded-md max-w-[450px]', {
      'flex flex-wrap gap-2': direction === 'row',
      'flex flex-col gap-2': direction === 'column'
    })}
  >
    {tags.map((tagObj) =>
      customTagRenderer ? (
        customTagRenderer(tagObj)
      ) : (
        <Tag key={tagObj.id} tagObj={tagObj} {...tagProps} />
      )
    )}
  </div>
);
