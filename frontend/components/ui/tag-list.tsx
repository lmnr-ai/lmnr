import React from 'react';
import { type Tag as TagType } from './tag-input';
import { Tag, TagProps } from './tag';
import { cn } from '@/lib/utils';

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
}) => {
  return (
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
};
